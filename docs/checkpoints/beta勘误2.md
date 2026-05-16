系统路径无法生效，会出现

st\\electron.exe","."]}
Error occurred in handler for 'cmd:session:create': SessionManagerError: [SessionManager] CwdNotAccessible: 宸ヤ綔鐩綍 "C:\Users\liyue\Desktop\cutie" 涓嶅瓨鍦ㄦ垨涓嶆槸鐩綍銆傚彲鑳藉畠琚垹闄?/ 鏀瑰悕,鎴栬矾寰勯噷鍚?Marina 鏃犳硶璁块棶鐨勫瓧绗︺€?    at SessionManager.createSession (file:///E:/projects/terminal/out/main/index.js:1669:17)
    at async file:///E:/projects/terminal/out/main/index.js:4137:24
    at async WebContents.<anonymous> (node:electron/js2c/browser_init:2:83724) {
  code: 'CwdNotAccessible',
  details: { cwd: 'C:\\Users\\liyue\\Desktop\\cutie' }
}
Error occurred in handler for 'cmd:session:create': SessionManagerError: [SessionManager] CwdNotAccessible: 宸ヤ綔鐩綍 "system:home" 涓嶅瓨鍦ㄦ垨涓嶆槸鐩綍銆傚彲鑳藉畠琚垹闄?/  鏀瑰悕,鎴栬矾寰勯噷鍚?Marina 鏃犳硶璁块棶鐨勫瓧绗︺€?    at SessionManager.createSession (file:///E:/projects/terminal/out/main/index.js:1669:17)
    at async file:///E:/projects/terminal/out/main/index.js:4137:24
    at async WebContents.<anonymous> (node:electron/js2c/browser_init:2:83724) {
  code: 'CwdNotAccessible',
  details: { cwd: 'system:home' }
}

的问题



然后就是无效路径的警图标会将路径字符串往右顶，这样就和其他的路径不对齐了

左右栏现在更不对齐了，见![不对齐](E:\projects\terminal\docs\checkpoints\不对齐.png)



测试 3.7 — 新窗口右键打开自动展开(BETA-042)还没有测，这个要打包之后再测

然后右键菜单、弹窗还是不对，都是Rose pine默认主题，没有跟随主题

取消标题的圆角，然后现在斜体字还是被切断，你还是没有给斜体字的向右倾斜留出余量，或者留出了但是被遮挡了

AI助手不能填写自定义Base URL，这是个严重问题