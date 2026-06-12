const DATA_PATH = "./data/papers.json";
let papers = [];
let currentRows = [];

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

async function loadPapers() {
  try {
    const response = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`读取失败：${response.status}`);
    }
    papers = await response.json();
    if (!Array.isArray(papers)) papers = [];
    papers.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    $("status").textContent = `已读取 ${papers.length} 条论文记录。`;
    render();
  } catch (error) {
    $("status").textContent = `无法读取 data/papers.json：${error.message}`;
    $("status").classList.add("error");
  }
}

function updateSummary(rows) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  $("totalCount").textContent = papers.length;
  $("monthCount").textContent = papers.filter(p => String(p.date || "").startsWith(monthPrefix)).length;

  const topics = new Set(papers.map(p => String(p.topic || "").trim()).filter(Boolean));
  $("topicCount").textContent = topics.size;

  const tags = new Set(
    papers.flatMap(p => String(p.tags || "").split(",").map(t => t.trim()).filter(Boolean))
  );
  $("tagCount").textContent = tags.size;
}

function getFilteredRows() {
  const keyword = normalize($("searchInput").value);
  const status = $("statusFilter").value;

  return papers.filter(p => {
    const text = normalize(JSON.stringify(p));
    const matchKeyword = !keyword || text.includes(keyword);
    const matchStatus = !status || p.status === status;
    return matchKeyword && matchStatus;
  });
}

function render() {
  const rows = getFilteredRows();
  currentRows = rows;
  updateSummary(rows);

  $("paperTable").innerHTML = rows.map(p => `
    <tr>
      <td>${escapeHTML(p.date)}</td>
      <td>
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
  `).join("");

  $("status").textContent = `显示 ${rows.length} / ${papers.length} 条论文记录。`;
}

function exportCSV() {
  const headers = ["日期", "标题", "作者", "年份", "链接", "领域", "问题", "方法", "数据集", "指标", "贡献", "局限", "启发", "标签", "状态"];
  const rows = currentRows.map(p => [
    p.date, p.title, p.authors, p.year, p.link, p.topic, p.problem, p.method,
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
$("exportBtn").addEventListener("click", exportCSV);

loadPapers();