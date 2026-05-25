# Goldfish Pond 部署说明

这是一个纯静态页面项目（`index.html`、`styles.css`、`main.js`），不需要后端。

## 本地预览

直接双击 `index.html` 可以查看。  
更推荐用本地静态服务（避免部分浏览器对 `file://` 的限制）：

```bash
npx serve .
```

然后打开 `http://localhost:3000`。

## 方案一：Cloudflare Pages（推荐，免费）

1. 把项目上传到 GitHub 仓库。
2. 打开 [Cloudflare Pages](https://pages.cloudflare.com/) 并登录。
3. `Create a project` -> `Connect to Git` -> 选择你的 GitHub 仓库。
4. 构建配置：
- `Framework preset`: `None`
- `Build command`: 留空
- `Build output directory`: `.`
5. 点击 `Save and Deploy`。
6. 部署完成后会得到一个公开 URL（例如 `https://xxx.pages.dev`）。

## 方案二：Vercel（非常快）

1. 把项目上传到 GitHub 仓库。
2. 打开 [Vercel](https://vercel.com/) 并导入该仓库。
3. 配置：
- `Framework Preset`: `Other`
- `Build Command`: 留空
- `Output Directory`: `.`
4. 点击 `Deploy`。

## 方案三：GitHub Pages（最原生）

1. 把项目上传到 GitHub 仓库。
2. 仓库页面 -> `Settings` -> `Pages`。
3. `Source` 选择 `Deploy from a branch`。
4. 选择分支（通常 `main`）和目录 `/ (root)`。
5. 保存后等待 1-5 分钟，访问给出的 Pages 链接。

## 常见问题

- 页面空白：先按 `Ctrl+F5` 强制刷新。
- 手机访问卡顿：在参数面板中降低鱼数量和特效强度。
- 更新后没生效：确认平台已完成最新 commit 的部署。

## 建议

优先用 Cloudflare Pages：配置最少、国内外访问都比较稳。
