# 论文阅读记录

这是一个适合部署到 GitHub Pages 的静态论文阅读记录项目。

## 页面

- `index.html`：展示页，公开查看论文阅读记录，并按类别分组展示。
- `admin.html`：管理页，可以新增、编辑、删除论文。
- `data/papers.json`：论文数据源。
- `assets/app.js`：展示页逻辑。
- `assets/admin.js`：管理页逻辑。
- `assets/style.css`：样式。

## 功能

- 新增论文
- 修改已有论文
- 删除论文
- 按类别分组展示论文
- 按类别筛选论文
- 搜索标题、作者、类别、领域、方法、贡献、标签
- 按阅读状态筛选
- 导出当前筛选结果为 CSV

## 类别字段

每条论文使用 `category` 字段表示类别，例如：

- `VLA`
- `VLN`
- `WM`
- `WAM`
- `LLM`
- `RAG`
- `Agent`
- `Robotics`
- `Other`

你也可以在输入框里填写自定义类别。

## 使用步骤

1. 在 GitHub 新建仓库，例如 `paper-reading`。
2. 上传本项目所有文件。
3. 打开仓库 `Settings -> Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`，保存。
6. 创建 Fine-grained personal access token：
   - 只选择这个仓库。
   - Repository permissions 中把 `Contents` 设置为 `Read and write`。
   - 不要把 token 写入仓库。
7. 打开 `https://你的用户名.github.io/paper-reading/admin.html`。
8. 填入用户名、仓库名、分支和 token，保存到浏览器。
9. 在 `admin.html` 中：
   - 新增论文：填写表单后点击“新增到 GitHub”。
   - 编辑论文：点击“读取已有论文”，在列表中点“编辑”，改完后保存。
   - 删除论文：在列表中点“删除”。
10. 到 `index.html` 查看按类别分组后的结果。

## 关于旧数据兼容

旧版本没有 `category` 的数据，在第一次读取时会自动补齐：

- 如果标题、领域或标签中包含 `VLA`、`VLN`、`WM`、`WAM`，会自动归到对应类别。
- 否则归到 `未分类`。

旧版本没有 `id` 的数据，也会自动补齐 `id`，用于稳定编辑和删除。

## 注意

GitHub Pages 是静态站点，无法自己保存数据；本项目通过 GitHub API 提交 JSON 文件来实现“管理页写入、展示页读取”。

Token 只保存在本机浏览器 localStorage 中。不要在公共电脑上使用，不要把 token 粘贴到代码里。

## 生成 IEEE 格式综述草稿

v4 新增 `review.html` 页面：

- 从 `data/papers.json` 读取论文记录。
- 支持按类别、状态、关键词筛选。
- 可生成：
  - IEEEtran LaTeX 草稿
  - Markdown 综述草稿
  - 用于 ChatGPT/LLM 润色的 Prompt
- 支持复制和下载结果。

访问地址：

```text
https://你的用户名.github.io/paper-reading/review.html
```

注意：该功能是基于结构化字段生成可编辑草稿，不会自动保证技术判断和引用信息完全正确。正式写作前需要人工核对原论文、补全参考文献信息并润色语言。
