右键菜单没有正确使用主题

复制粘贴功能不正常，一般都不能复制粘贴，有的时候某些奇怪的键位，如shift+？反而粘贴了一段内容

滚动条不可靠并且和渲染有重叠（已修改）

claude的自动重命名无效（已修改）

目前新建页面只有一个shell和模板，但是我认为这样是不好的，最好是把所有检测到的shell都列出来，包括windows powershell git bash等

（这里可能需要修改架构，你仔细调研一下）

默认模板的图标不是官方图标

目前的xterm渲染效果不稳定

临时栏没有打开文件夹的加号

加个小功能：红绿灯不显示悬浮图标

然后把在xxx添加终端做成一个标签页，类似chrome空白页的逻辑，而不是游离在标签页之外的页面

在切换到cladue code标签页的一瞬间，左边的黄色（不活动）的终端会变绿一下，这是点进去之后claude的重绘

导致的，你需要通过消抖解决这个问题



启动报错

2026-05-12T14:39:54.019Z [INFO] [main] bootstrap starting {"dataDir":"C:\\Users\\liyue\\AppData\\Roaming\\marina-app"}
2026-05-12T14:39:54.786Z [INFO] [main] settings loaded from: main
2026-05-12T14:39:54.811Z [INFO] [main] templates loaded from: main
[3736:0512/223954.904:ERROR:cache_util_win.cc(20)] Unable to move the cache: 鎷掔粷璁块棶銆?(0x5)

[3736:0512/223954.905:ERROR:disk_cache.cc(208)] Unable to create cache



将文件拖动到终端的功能被 自定义的“将文件夹放到终端功能所破坏了，直接移除 将文件夹拖放到终端的功能，保留终端拖放的默认行为





