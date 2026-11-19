# 保留最新n个文件的bash脚本


> **2026-11-19 更新说明：** 保留原发布日期和原网址，重写为可预览、可校验的安全脚本。原文那份 `ls | xargs rm -rf` 示例在空格文件名、前导短横线、目录路径和匹配范围上都不安全，不能靠文末补一句警告继续使用。本文给出完整可运行实现，并写明测试范围与做不到的保证。

原文只有一段三十多行的脚本：进入目标目录，用 `ls -lrt` 取出“最新 N 个”名字，再把其余项交给 `xargs rm -rf`。它默认保留 5 个文件，也可按关键字过滤，但没有预览、没有路径限制，也没有把文件名当作不可拆分的完整字符串处理。

这次改成：Bash 负责入口和 `set -euo pipefail`，Python 3 负责枚举、排序、校验和可选删除。默认只打印计划；确认后再加 `--apply`。它面向在一个备份或日志目录里保留最近 N 个普通文件，不是通用清理工具，也不是生产级备份系统。

## 原文实现为什么不能继续用

下面这些不是风格问题，而是会导致误删或漏删的具体缺陷：

- 脚本以 `#!/bin/sh` 开头，却使用了 `[[ ... ]]`。在严格 POSIX `sh` 上不能依赖这一语法。
- `cd $dir` 没有加引号，目录名含空格或通配符时会分词或被展开。
- `ls -lrt | awk '{print $NF}'` 把人类阅读用的列表最后一列当成文件名。文件名含空格时只会留下最后一段；含换行时会被拆成多条记录。GNU Coreutils 的 [ls 调用说明](https://www.gnu.org/software/coreutils/manual/html_node/ls-invocation.html) 描述的是供人查看的列表格式，不是稳定的程序接口。
- `grep -v "$save_file"` 做的是整行文本匹配，不是“精确排除这 N 个文件名”。多个名字被拼进一个字符串后，子串还可能误伤其他文件。
- `xargs rm -rf` 默认按空白分词，也不处理以 `-` 开头的文件名；`-rf` 还会递归删除目录。目标目录里如果有子目录，可能被整棵删除。
- 没有 dry-run，没有 `N >= 1` 的严格校验，也没有拒绝 `/`、家目录或符号链接目录。一旦参数写错，会直接改目标。

所以要用“只处理本层普通文件、先看计划、再用目录文件描述符删除文件名”的方式重写，而不是在原脚本后面追加注意事项。

## 适用范围

适用：在你明确指定的**一个绝对路径目录**中，按修改时间保留最新的 N 个匹配普通文件，预览或删除其余匹配普通文件。

不适用：递归清理、跟随符号链接处理目标文件、清空家目录或系统目录、并发多进程同时整理同一目录、跨设备快照、备份完整性校验。匹配规则只作用于文件名，不进入子目录。

依赖：Bash 4+（本文测试环境为 Bash 5.2.37），以及 Python 3（本文测试为 3.13.5）。需要平台支持 `os.O_NOFOLLOW` 和 `dir_fd`，一般对应 Linux 或类似的 Unix。官方依据见文末。

## 完整脚本

把下面保存为 `keep-latest-n.sh`，然后 `chmod +x keep-latest-n.sh`。

```bash
#!/usr/bin/env bash
# keep-latest-n.sh
# 在一个已存在的绝对目录中，按修改时间保留最新的 N 个普通文件。
# 默认只打印计划，不删除。枚举与删除路径由 Python 3 完成，以便安全处理
# 空格、换行和前导短横线文件名，并不跟随符号链接。
set -euo pipefail

usage() {
  cat <<'EOF' >&2
用法:
  keep-latest-n.sh --directory ABS_DIR --keep N [--glob PATTERN] [--include-hidden] [--json]
  keep-latest-n.sh --directory ABS_DIR --keep N [--glob PATTERN] [--include-hidden] [--json] --apply

说明:
  默认是 dry-run，只打印将保留和将删除的文件，不修改目录。
  必须给出绝对目录和 N（N 为大于等于 1 的十进制整数）。
  只处理该目录下的一层普通文件，不递归，不跟随符号链接。
  --glob 只匹配文件名，不能包含斜杠；默认 * ，且默认跳过以点开头的文件名。
  --apply 才会删除计划中的文件。删除失败会立即停止。
EOF
}

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' "错误：需要可用的 python3。" >&2
  exit 2
fi

exec python3 - "$@" <<'PY'
import argparse
import fnmatch
import json
import os
import re
import stat
import sys

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_REJECTED = 3
EXIT_APPLY = 4

# 仅拒绝这些路径本身，不把它们的安全子目录一律禁止。
# 家目录也只拒绝精确匹配（含解析后的路径），以便 ~/backups 仍可使用。
FORBIDDEN_EXACT = frozenset(
    {
        "/",
        "/home",
        "/root",
        "/etc",
        "/usr",
        "/usr/bin",
        "/usr/sbin",
        "/usr/local",
        "/var",
        "/var/tmp",
        "/bin",
        "/sbin",
        "/lib",
        "/lib32",
        "/lib64",
        "/libx32",
        "/boot",
        "/sys",
        "/proc",
        "/dev",
        "/run",
        "/snap",
        "/opt",
        "/srv",
        "/mnt",
        "/media",
        "/tmp",
    }
)
VIRTUAL_PREFIXES = ("/proc/", "/sys/", "/dev/")


def fail(code, message):
    print(f"错误：{message}", file=sys.stderr)
    sys.exit(code)


def parse_keep(value):
    if not re.fullmatch(r"[1-9][0-9]*", value or ""):
        fail(
            EXIT_USAGE,
            " --keep 必须是大于等于 1 的十进制整数，不能有符号、小数或前导零。",
        )
    return int(value)


def normalize_path(path):
    return os.path.normpath(path).rstrip("/") or "/"


def collect_forbidden():
    forbidden = set(FORBIDDEN_EXACT)
    candidates = []
    home = os.environ.get("HOME")
    if home:
        candidates.append(home)
    expanded = os.path.expanduser("~")
    if expanded and expanded != "~":
        candidates.append(expanded)
    for raw in candidates:
        if not raw:
            continue
        abs_path = normalize_path(os.path.abspath(os.path.expanduser(raw)))
        forbidden.add(abs_path)
        try:
            forbidden.add(normalize_path(os.path.realpath(raw)))
        except OSError:
            pass
    return forbidden


def inspect_directory(path):
    if not path:
        fail(EXIT_USAGE, "必须提供 --directory。")
    if path.startswith("~"):
        fail(EXIT_USAGE, "请展开 ~ 后传入绝对路径，避免依赖当前用户家目录的隐式展开。")
    if not os.path.isabs(path):
        fail(EXIT_USAGE, " --directory 必须是绝对路径，避免相对当前工作目录造成误操作。")
    if "\x00" in path:
        fail(EXIT_USAGE, "目录路径不能包含空字符。")

    given = normalize_path(path)
    try:
        given_st = os.lstat(given)
    except OSError as exc:
        fail(EXIT_USAGE, f"无法读取目录 {given!r}：{exc}")

    if stat.S_ISLNK(given_st.st_mode):
        fail(EXIT_REJECTED, f"{given!r} 是符号链接，已拒绝（不跟随符号链接）。")
    if not stat.S_ISDIR(given_st.st_mode):
        fail(EXIT_USAGE, f"{given!r} 不是目录。")

    try:
        canonical = normalize_path(os.path.realpath(given))
    except OSError as exc:
        fail(EXIT_USAGE, f"无法解析目录 {given!r}：{exc}")

    forbidden = collect_forbidden()
    for candidate in (given, canonical):
        if candidate in forbidden:
            fail(EXIT_REJECTED, f"{candidate!r} 属于根目录、家目录或其他危险路径，已拒绝。")
        if any(candidate.startswith(prefix) for prefix in VIRTUAL_PREFIXES):
            fail(EXIT_REJECTED, f"{candidate!r} 位于虚拟文件系统下，已拒绝。")
    return given, canonical


def open_directory(path):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    if not hasattr(os, "O_NOFOLLOW"):
        fail(EXIT_REJECTED, "当前 Python/平台没有 os.O_NOFOLLOW，拒绝继续。")
    flags |= os.O_NOFOLLOW
    if os.unlink not in os.supports_dir_fd or os.stat not in os.supports_dir_fd:
        fail(EXIT_REJECTED, "当前平台不支持 dir_fd，拒绝继续。")
    try:
        return os.open(path, flags)
    except OSError as exc:
        fail(EXIT_REJECTED, f"无法打开目录 {path!r}（不跟随符号链接）：{exc}")


def validate_glob(pattern):
    if pattern is None or pattern == "":
        fail(EXIT_USAGE, " --glob 不能为空。")
    if "\x00" in pattern or "/" in pattern:
        fail(EXIT_USAGE, " --glob 只匹配文件名，不能包含斜杠或空字符，也不会递归。")
    return pattern


def list_candidates(dir_fd, pattern, include_hidden):
    matched = []
    try:
        with os.scandir(dir_fd) as iterator:
            for entry in iterator:
                name = entry.name
                if name in (".", ".."):
                    continue
                if "/" in name or "\x00" in name:
                    fail(EXIT_APPLY, f"目录项 {name!r} 含有非法分隔符，已停止。")
                if not include_hidden and name.startswith("."):
                    continue
                if not fnmatch.fnmatchcase(name, pattern):
                    continue
                try:
                    if entry.is_symlink():
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    info = entry.stat(follow_symlinks=False)
                except OSError as exc:
                    fail(EXIT_APPLY, f"读取目录项 {name!r} 失败，已停止：{exc}")
                if not stat.S_ISREG(info.st_mode):
                    continue
                matched.append(
                    {
                        "name": name,
                        "mtime_ns": info.st_mtime_ns,
                        "size": info.st_size,
                        "inode": info.st_ino,
                    }
                )
    except OSError as exc:
        fail(EXIT_APPLY, f"枚举目录失败，已停止：{exc}")
    # 先按修改时间从新到旧，时间相同再按文件名升序，排序稳定可复查。
    matched.sort(key=lambda item: (-item["mtime_ns"], item["name"]))
    return matched


def mock_log_path():
    value = os.environ.get("KEEP_LATEST_N_UNLINK_LOG")
    if value is None or value == "":
        return None
    if not os.path.isabs(value):
        fail(EXIT_USAGE, "KEEP_LATEST_N_UNLINK_LOG 必须是绝对路径。")
    return value


def unlink_one(dir_fd, name, expected_inode=None):
    if not name or name in (".", "..") or "/" in name or "\x00" in name:
        raise RuntimeError(f"拒绝删除非法文件名 {name!r}")
    try:
        info = os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
    except OSError as exc:
        raise RuntimeError(f"删除前复查 {name!r} 失败：{exc}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise RuntimeError(f"拒绝删除 {name!r}：复查时已不是普通文件")
    if expected_inode is not None and info.st_ino != expected_inode:
        raise RuntimeError(
            f"拒绝删除 {name!r}：inode 已从 {expected_inode} 变为 {info.st_ino}，停止以免误删被替换的文件"
        )
    log_path = mock_log_path()
    if log_path is not None:
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(name, ensure_ascii=False) + "\n")
        return "mocked"
    os.unlink(name, dir_fd=dir_fd)
    return "unlinked"


def apply_deletes(dir_fd, items):
    completed = []
    for item in items:
        name = item["name"]
        try:
            action = unlink_one(dir_fd, name, expected_inode=item.get("inode"))
        except (OSError, RuntimeError) as exc:
            fail(
                EXIT_APPLY,
                f"已停止删除。已处理 {len(completed)} 个文件，失败文件 {name!r}：{exc}",
            )
        completed.append({"name": name, "action": action, "inode": item.get("inode")})
    return completed


def human_report(payload):
    mode = payload["mode"]
    print(f"模式：{mode}")
    print(f"目录：{payload['directory']}")
    print(f"规范路径：{payload['canonical_directory']}")
    print(f"保留数量：{payload['keep_n']}")
    print(f"匹配规则：fnmatchcase {payload['glob']!r}，include_hidden={payload['include_hidden']}")
    print(f"匹配到的普通文件：{len(payload['matched'])}")
    print("将保留：")
    if not payload["keep"]:
        print("  （无）")
    for item in payload["keep"]:
        print(f"  KEEP  mtime_ns={item['mtime_ns']}  name={json.dumps(item['name'], ensure_ascii=False)}")
    print("将删除：")
    if not payload["delete"]:
        print("  （无）")
    for item in payload["delete"]:
        print(f"  DELETE  mtime_ns={item['mtime_ns']}  name={json.dumps(item['name'], ensure_ascii=False)}")
    if payload.get("processed"):
        print("本次处理：")
        for item in payload["processed"]:
            print(f"  {item['action'].upper()}  name={json.dumps(item['name'], ensure_ascii=False)}")
    if mode == "dry-run":
        print("这是预览，没有删除任何文件。如需删除，请先核对计划再追加 --apply。")
    elif payload.get("unlink_hook") == "KEEP_LATEST_N_UNLINK_LOG":
        print("检测到 KEEP_LATEST_N_UNLINK_LOG，已记录计划删除项，没有调用 os.unlink。")
    else:
        print("已按复查后的文件名在该目录文件描述符上调用 os.unlink。")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="keep-latest-n.sh",
        add_help=True,
        description="预览或删除一个目录中除最新 N 个普通文件以外的匹配文件。",
    )
    parser.add_argument("--directory", required=True, help="绝对目录路径")
    parser.add_argument("--keep", required=True, help="至少保留的普通文件数量，整数且 >= 1")
    parser.add_argument("--glob", default="*", help="只匹配文件名的模式，默认 *")
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="包含以点开头的文件名；默认排除。Python fnmatch 的 * 本身会匹配点文件，因此要显式排除",
    )
    parser.add_argument("--json", action="store_true", help="只输出 JSON")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="实际删除计划中的文件；默认只预览",
    )
    return parser


def main(argv):
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        # argparse 的错误已经写到 stderr
        raise exc

    keep_n = parse_keep(args.keep)
    pattern = validate_glob(args.glob)
    given, canonical = inspect_directory(args.directory)
    dir_fd = open_directory(given)
    try:
        matched = list_candidates(dir_fd, pattern, args.include_hidden)
        keep = matched[:keep_n]
        delete = matched[keep_n:]
        hook = "KEEP_LATEST_N_UNLINK_LOG" if mock_log_path() else None
        processed = []
        mode = "apply" if args.apply else "dry-run"
        if args.apply:
            processed = apply_deletes(dir_fd, delete)
        payload = {
            "mode": mode,
            "directory": given,
            "canonical_directory": canonical,
            "keep_n": keep_n,
            "glob": pattern,
            "include_hidden": bool(args.include_hidden),
            "matched": matched,
            "keep": keep,
            "delete": delete,
            "processed": processed,
            "unlink_hook": hook,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            human_report(payload)
        return EXIT_OK
    finally:
        os.close(dir_fd)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
PY
```

## 先预览，再决定是否删除

必须提供绝对目录和保留数量。省略 `--apply` 时只打印计划，不修改目录：

```bash
./keep-latest-n.sh --directory /absolute/path/to/backup-dir --keep 5
./keep-latest-n.sh --directory /absolute/path/to/backup-dir --keep 5 --glob '*.log'
./keep-latest-n.sh --directory /absolute/path/to/backup-dir --keep 5 --json
```

`--json` 便于复查和测试解析。文件名以 JSON 字符串输出，换行或前导短横线不会被拆开。请先看“将保留”和“将删除”两组名单，确认目录、N 和 glob 都正确，再在同一条命令上追加 `--apply`。

`--keep` 必须是大于等于 1 的十进制整数，例如 `5`。`0`、负数、小数、`01` 这类前导零，或空参数，都会被拒绝。若匹配到的普通文件少于 N，则全部保留、不删除。

不要对相对路径、`~/foo` 或当前目录的 `.` 抱侥幸：脚本要求已经展开的绝对路径，避免“当时在哪个目录”改变删除目标。

## 匹配范围、排序和不跟随链接

默认 `--glob '*'`，并且**默认跳过以点开头的文件名**。这是有意为之：[Python 3.13 fnmatch 文档](https://docs.python.org/3.13/library/fnmatch.html) 写明，`*` 和 `?` 会匹配以点开头的文件名。若沿用 shell 里“`*` 不碰隐藏文件”的习惯，必须在程序里显式排除。需要包含点文件时，加 `--include-hidden`。

`--glob` 只匹配文件名，不能包含 `/`。它使用 `fnmatch.fnmatchcase`，在 Linux 上大小写敏感，也不会把模式当成正则。要过滤日志文件，用 `*.log`，不要用 `.*\.log`。

枚举使用 `os.scandir`，并用 `is_symlink()`、`is_file(follow_symlinks=False)`、`stat(follow_symlinks=False)`。符号链接即便指向普通文件，也不会进入保留或删除名单；子目录及其内部文件不会被递归看到。目录本身若是符号链接，会被直接拒绝。打开目录时加上 `O_DIRECTORY | O_NOFOLLOW`，避免最后一层是链接时把操作转到别处。

排序键是 `(-mtime_ns, name)`：先按修改时间从新到旧，时间相同再按文件名升序。`scandir` 的返回顺序本身是任意的，必须在程序里显式排序，结果才可复查。这里的“最新”指该文件的 `st_mtime_ns`，不是创建时间，也不是文件名里的日期字符串。

## 拒绝危险路径

脚本会规范化传入路径，并用 `lstat` 与 `realpath` 对照。以下目标会被拒绝并返回退出码 3：

- `/` 以及 `/etc`、`/usr`、`/var`、`/tmp`、`/boot`、`/opt` 等常见系统目录的**精确路径**
- 当前 `HOME`（以及 `~` 展开后）的精确路径，这样 `HOME/backups` 仍可使用，但不能把家目录本身当清理目标
- `/proc`、`/sys`、`/dev` 及其子路径
- 最终路径分量是符号链接的目录，包括指向根目录的链接

拒绝的是这些路径本身，不是它们下面所有安全子目录。即便如此，也不要把脚本指向你没有准备删除文件的目录。`/tmp` 作为精确路径被拒绝，是因为它是共享临时目录，不适合当默认清理目标；你自己创建的、位于其他位置的绝对目录仍可使用。

## 删除时如何失败停止

加上 `--apply` 后，脚本会在已经打开的目录文件描述符上，对“将删除”名单逐个复查再调用 `os.unlink(name, dir_fd=...)`。复查包括：文件名不含斜杠、`follow_symlinks=False` 的 `stat` 仍是普通文件，以及 inode 仍与枚举时一致。任一步失败就立即停止，不再处理后续文件，退出码为 4。

它删除的是目录项，不会对目录调用 `rm -rf`。按 [os.remove / os.unlink](https://docs.python.org/3.13/library/os.html#os.remove) 的说明，若目标此时是目录，会得到 `OSError`，脚本会把它当作失败并停止。前导短横线文件名作为相对目录描述符的名字传递，不会被当成命令选项。

环境变量 `KEEP_LATEST_N_UNLINK_LOG` 只给测试用：如果把它设成一个绝对路径，`--apply` 会把本要删除的文件名追加到该文件，**不会调用 `os.unlink`**。日常使用不要设置它，否则会误以为已经删除。

## 做不到的保证

即使用目录描述符、不跟随链接、删除前复查 inode，这里仍有时间窗口。枚举、打印计划和真正 `unlink` 不是原子事务。[os.scandir 文档](https://docs.python.org/3.13/library/os.html#os.scandir) 也写明：迭代器创建后，目录里有文件被增删时，该项是否出现是未指定的。另一个进程若在同一瞬间替换同名文件、写入新备份，或同时运行第二份清理脚本，结果可能与预览不一致。inode 复查能挡住一部分“同名但已换成另一个文件”的情况，不能消除所有 TOCTOU 竞争，也**不能称为并发安全或生产级保证**。

其他边界同样要接受：

- 硬链接只减少一个目录项，不会单独判断“这是不是别的目录里那份重要文件”。
- 若删除到一半失败，已经删除的文件不会自动回滚。这是先预览、再备份、再 `--apply` 的原因。
- 修改时间来自文件系统，复制或解压可能改变 mtime，不应用文件名日期去推翻这里的排序。
- 本脚本不是快照、不是版本库、也不是可以对抗恶意并发改目录的锁服务。

若目录里有正在写入的文件，先停写入或改用真正的备份方案，再考虑保留最近 N 份。

## 本次实测范围

测试时间是 **2026-11-19 14:49:28（Asia/Bangkok，UTC+7）**，环境为 Python 3.13.5、GNU Bash 5.2.37、Linux x86_64。测试只针对本轮在隔离临时目录中创建的沙箱。

没有对用户家目录、共享目录或沙箱外已有文件做删除。最终脚本 SHA-256：

`e152396983940d94f39c715d7424e833048ec4bcd8bbdecf5238d62c330cb9cd`

共 27 项全部通过。以下是结果摘要，测试运行器和原始日志未随正文发布；三类结果必须分开看：

1. **计划与拒绝路径**（隔离子进程，无删除）：校验 `N` 与路径参数；拒绝 `/`、`/etc`、`/tmp`、`/usr`、`/var`、`/proc`、`/dev`、当前 `HOME`、指向根目录的符号链接和符号链接目录；dry-run 正确保留最新 3 个 `*.log`，处理空格、换行、`--help`、`-rf`，不递归子目录，不把符号链接或默认点文件纳入名单；沙箱在这些步骤后校验和不变。
2. **模拟删除回调**（无真实 unlink）：在 `sandbox-.../apply-mock` 中设置 `KEEP_LATEST_N_UNLINK_LOG` 后执行 `--apply`。日志记下了 `c space.txt`、`b.txt`、`a.txt`，该目录文件校验和与执行前一致，**没有调用 `os.unlink`**。
3. **有范围的真实 unlink**：只针对本轮在 `sandbox-.../apply-real` 里创建的文件。保留了 `-drop` 和含换行的 `drop\nnl`，删除了 `drop space`、`remain-a`、`remain-b`。同沙箱中的 `WITNESS_DO_NOT_TOUCH` 与 `plan/` 校验和未变。这不是对用户数据或共享目录的端到端清理验收，只说明在受控临时目录里，`--apply` 按计划删除了指定普通文件。

## 官方依据（2026-11-19 核读）

- [Bash Reference Manual：The Set Builtin](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html)：`set -e`、`set -u`、`pipefail`。
- [Python 3.13 os 模块](https://docs.python.org/3.13/library/os.html)：`scandir`、`DirEntry` 的 `follow_symlinks=False`、`O_NOFOLLOW`、`dir_fd`、`unlink`/`remove`。
- [Python 3.13 fnmatch](https://docs.python.org/3.13/library/fnmatch.html)：文件名模式，以及 `*` 会匹配点文件。
- [Python 3.13 stat](https://docs.python.org/3.13/library/stat.html)：普通文件与符号链接的判定。
- [GNU Coreutils：ls invocation](https://www.gnu.org/software/coreutils/manual/html_node/ls-invocation.html)：对照原文对 `ls` 列表的依赖。

本次没有在真实备份目录上做清理。

