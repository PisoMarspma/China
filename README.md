# 小游戏合集（浏览器版）

打开后有七个选项：

1. 坦克大战
2. 俄罗斯方块
3. 打飞机
4. 台球（九球简化）
5. 下100楼
6. 赛车
7. 贪吃蛇

## 运行

最简单：直接双击打开 `index.html`。

### 在 VS Code 中打开浏览器

如果你想在 VS Code 里预览页面，可以用下面几种方式：

1. 安装 Live Server 扩展。
2. 在 `index.html` 上右键，选择 Open with Live Server。
3. 浏览器会自动打开本地页面。

如果 Live Server 不方便，也可以先启动本地静态服务：

```bash
cd b:\github\China
python -m http.server 8000
```

然后在浏览器里访问：

- http://localhost:8000/

如果你已经在 VS Code 里打开了项目，也可以直接用命令面板搜索 Open in Default Browser 或 Live Preview: Show Preview（前提是安装了对应扩展）。

### 如何停止

如果你是用 `python -m http.server 8000` 启动的服务，回到那个终端，按 `Ctrl + C` 就可以停止。

如果你只是想关掉网页，直接关闭浏览器标签页即可。

### 启动（一步一步）

1. 用 Live Server（推荐）
	- 在 VS Code 中安装扩展 `Live Server`。
	- 右键 `index.html`，选择 `Open with Live Server`。
	- 浏览器会自动打开并加载页面。

2. 或者用本地静态服务
	- 在 VS Code 终端或系统终端中切换到项目根目录：

```bash
cd b:\github\China
python -m http.server 8000
```

	- 打开浏览器访问 `http://localhost:8000/`。

3. 在 VS Code 中直接用命令面板
	- 按 `Ctrl+Shift+P`（或 F1），输入 `Open in Default Browser` 或 `Live Preview: Show Preview`（需安装相应扩展）。

### 停止（一步一步）

1. 如果是用 `python -m http.server` 启动的服务：
	- 切回运行该命令的终端，按 `Ctrl + C` 停止服务。

2. 如果是用 Live Server：
	- 点击 VS Code 状态栏的 `Go Live` / `Port: xxxx` 区域上的停止按钮，或在扩展控制面板停止。

3. 如果只是关掉页面：
	- 直接关闭浏览器标签页或窗口即可。

提示：进入游戏页面后单击画面以获取键盘焦点（某些浏览器出于安全策略需要用户交互后才允许音频/键盘控制）。

# 查找占用 8000 端口的进程
netstat -ano | findstr ":8000"

# 结果最后一列就是 PID，用下面的命令结束进程
taskkill /F /PID 进程ID


## 常见问题（点了模式后卡住/不动）

1. 用 `http://localhost:8000/` 的方式打开（不要用 `file://` 直接打开），并用 Edge/Chrome。
2. 强制刷新：`Ctrl + F5`。
3. 按 `F12` 打开开发者工具，看 Console 里是否有报错（把报错内容发我，我可以继续修）。

## 操作

- 菜单：`1/2/3/4/5/6/7` 或点击按钮开始，`Esc` 返回菜单
- 坦克大战：方向键移动，`Space` 开火
- 俄罗斯方块：`←→` 移动、`↑` 旋转、`↓` 加速、`Space` 硬降
- 打飞机：鼠标移动或方向键移动，按住 `Space`（或按住鼠标）连发
 - 台球：鼠标按下拖拽瞄准，松开击球；`R` 重新摆球
- 下100楼：方向键左右移动，掉出底部则失败，`R` 重开
- 赛车：方向键左右换道躲车，`R` 重开
- 贪吃蛇：方向键控制蛇的移动方向，吃食物成长

提示：进入游戏后先单击画面获取键盘焦点。