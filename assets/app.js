const DATA_PATH = "./data/papers.json";
const DEFAULT_CATEGORIES = ["VLA", "VLN", "WM", "WAM", "LLM", "RAG", "Agent", "Robotics", "Other"];
let papers = [];
let currentRows = [];
let activeCategory = "";

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tagsToHTML(tags) {
  return String(tags || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `<span class="badge">${escapeHTML(t)}</span>`)
    .join("");
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function inferCategory(paper) {
  const explicit = String(paper.category || "").trim();
  if (explicit) return explicit;

  const text = `${paper.topic || ""} ${paper.tags || ""} ${paper.title || ""}`.toUpperCase();
  for (const c of ["VLA", "VLN", "WAM", "WM"]) {
    if (text.includes(c)) return c;
  }
  return "未分类";
}

function getCategoryList() {
  const categories = new Set(DEFAULT_CATEGORIES);
  papers.forEach(p => categories.add(inferCategory(p)));
  categories.delete("");
  return Array.from(categories).sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a);
    const bi = DEFAULT_CATEGORIES.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "zh-CN");
  });
}

async function loadPapers() {
  try {
    const response = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`读取失败：${response.status}`);
    }
    papers = await response.json();
    if (!Array.isArray(papers)) papers = [];
    papers.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    buildCategoryControls();
    $("status").textContent = `已读取 ${papers.length} 条论文记录。`;
    render();
  } catch (error) {
    $("status").textContent = `无法读取 data/papers.json：${error.message}`;
    $("status").classList.add("error");
  }
}

function buildCategoryControls() {
  const categories = getCategoryList();

  $("categoryFilter").innerHTML = `<option value="">全部类别</option>` +
    categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");

  renderCategoryNav(categories);
}

function renderCategoryNav(categories) {
  const counts = countByCategory(papers);
  const total = papers.length;

  $("categoryNav").innerHTML = [
    `<button class="${activeCategory === "" ? "active" : ""}" data-category="">全部 (${total})</button>`,
    ...categories.map(c => {
      const active = activeCategory === c ? "active" : "";
      return `<button class="${active}" data-category="${escapeHTML(c)}">${escapeHTML(c)} (${counts.get(c) || 0})</button>`;
    })
  ].join("");
}

function updateSummary() {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  $("totalCount").textContent = papers.length;
  $("monthCount").textContent = papers.filter(p => String(p.date || "").startsWith(monthPrefix)).length;

  const categories = new Set(papers.map(inferCategory).filter(Boolean));
  $("categoryCount").textContent = categories.size;

  const tags = new Set(
    papers.flatMap(p => String(p.tags || "").split(",").map(t => t.trim()).filter(Boolean))
  );
  $("tagCount").textContent = tags.size;
}

function countByCategory(rows) {
  const map = new Map();
  rows.forEach(p => {
    const category = inferCategory(p);
    map.set(category, (map.get(category) || 0) + 1);
  });
  return map;
}

function getFilteredRows() {
  const keyword = normalize($("searchInput").value);
  const status = $("statusFilter").value;
  const selectedCategory = activeCategory || $("categoryFilter").value;

  return papers.filter(p => {
    const category = inferCategory(p);
    const enriched = { ...p, category };
    const text = normalize(JSON.stringify(enriched));
    const matchKeyword = !keyword || text.includes(keyword);
    const matchStatus = !status || p.status === status;
    const matchCategory = !selectedCategory || category === selectedCategory;
    return matchKeyword && matchStatus && matchCategory;
  });
}

function groupRowsByCategory(rows) {
  const groups = new Map();
  rows.forEach(p => {
    const category = inferCategory(p);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(p);
  });

  const order = getCategoryList();
  return Array.from(groups.entries()).sort(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return ai - bi;
  });
}

function render() {
  const rows = getFilteredRows();
  currentRows = rows;
  updateSummary();
  renderCategoryNav(getCategoryList());

  const groups = groupRowsByCategory(rows);

  if (groups.length === 0) {
    $("groupedPapers").innerHTML = `<div class="empty-state">没有找到匹配的论文。</div>`;
    $("status").textContent = `显示 0 / ${papers.length} 条论文记录。`;
    return;
  }

  $("groupedPapers").innerHTML = groups.map(([category, items]) => `
    <section class="category-section">
      <div class="category-heading">
        <h2>${escapeHTML(category)}</h2>
        <span class="category-count">${items.length} 篇论文</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>论文</th>
              <th>领域 / 任务</th>
              <th>问题</th>
              <th>方法</th>
              <th>数据集 / 指标</th>
              <th>贡献</th>
              <th>局限</th>
              <th>启发</th>
              <th>标签 / 状态</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => renderPaperRow(p, category)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `).join("");

  $("status").textContent = `显示 ${rows.length} / ${papers.length} 条论文记录。`;
}

function renderPaperRow(p, category) {
  return `
    <tr>
      <td>${escapeHTML(p.date)}</td>
      <td>
        <div class="category-badge">${escapeHTML(category)}</div>
        <div class="paper-title">${escapeHTML(p.title)}</div>
        <div class="meta">${escapeHTML(p.authors || "")}${p.year ? ` · ${escapeHTML(p.year)}` : ""}</div>
        ${p.link ? `<div class="meta"><a href="${escapeHTML(p.link)}" target="_blank" rel="noopener">打开原文</a></div>` : ""}
      </td>
      <td>${escapeHTML(p.topic)}</td>
      <td>${escapeHTML(p.problem)}</td>
      <td>${escapeHTML(p.method)}</td>
      <td>
        <strong>数据集：</strong>${escapeHTML(p.dataset)}<br />
        <strong>指标：</strong>${escapeHTML(p.metric)}
      </td>
      <td>${escapeHTML(p.contribution)}</td>
      <td>${escapeHTML(p.limitation)}</td>
      <td>${escapeHTML(p.takeaway)}</td>
      <td>
        <div>${tagsToHTML(p.tags)}</div>
        <div class="meta">${escapeHTML(p.status)}</div>
      </td>
    </tr>
  `;
}

function exportCSV() {
  const headers = ["日期", "类别", "标题", "作者", "年份", "链接", "领域", "问题", "方法", "数据集", "指标", "贡献", "局限", "启发", "标签", "状态"];
  const rows = currentRows.map(p => [
    p.date, inferCategory(p), p.title, p.authors, p.year, p.link, p.topic, p.problem, p.method,
    p.dataset, p.metric, p.contribution, p.limitation, p.takeaway, p.tags, p.status
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "paper-reading-filtered.csv";
  a.click();
  URL.revokeObjectURL(url);
}

$("searchInput").addEventListener("input", render);
$("statusFilter").addEventListener("change", render);
$("categoryFilter").addEventListener("change", () => {
  activeCategory = $("categoryFilter").value;
  render();
});
$("categoryNav").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category || "";
  $("categoryFilter").value = activeCategory;
  render();
});
$("exportBtn").addEventListener("click", exportCSV);

loadPapers();
