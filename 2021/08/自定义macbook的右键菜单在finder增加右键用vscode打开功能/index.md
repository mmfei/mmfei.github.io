# 自定义macbook的右键菜单在Finder增加右键用vscode打开功能


1. Launch Automator 
2. Create New Document
3. Create a new Quick Action Select "Quick Action"
4. Add the Action...
5. Workflow receives current files and folders from Finder.
6. Add a new Run Shell Script action to the workflow. (drag the "Run Shell Script" object, highlighted in the screenshot, to the empty window on the right)
7. Configure the Workflow

8. Set the Pass Input to be as arguments
9. Paste the following in the input box:
```shell
open -n -b "com.microsoft.VSCode" --args "$*" 
```

![](/images/posts/自定义macbook的右键菜单在Finder增加右键用vscode打开功能/img.png)

