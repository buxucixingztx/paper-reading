const DATA_PATH = "./data/papers.json";
const DEFAULT_CATEGORIES = ["VLA", "VLN", "WM", "WAM", "LLM", "RAG", "Agent", "Robotics", "Other"];
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

function latexEscape(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replaceAll("$", "\\$")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}");
}

function bibKey(paper, index) {
  const raw = `${paper.authors || "paper"} ${paper.year || ""} ${paper.title || ""}`;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  return cleaned || `paper${index + 1}`;
}

function truncate(value, maxLen = 180) {
  const s = String(value || "").trim().replace(/\s+/g, " ");
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

function setStatus(message, isError = false) {
  $("reviewStatus").textContent = message;
  $("reviewStatus").classList.toggle("error", isError);
}

async function loadPapers() {
  try {
    setStatus("正在读取 data/papers.json...");
    const response = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`读取失败：${response.status}`);
    papers = await response.json();
    if (!Array.isArray(papers)) papers = [];
    papers = papers.map(p => ({ ...p, category: inferCategory(p) }))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    buildCategoryFilter();
    renderSelectionStats();
    setStatus(`已读取 ${papers.length} 条论文记录。`);
  } catch (error) {
    papers = [];
    currentRows = [];
    renderSelectionStats();
    setStatus(`无法读取 data/papers.json：${error.message}`, true);
  }
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

function buildCategoryFilter() {
  const selected = $("categoryFilter").value;
  const categories = getCategoryList();
  $("categoryFilter").innerHTML = `<option value="">全部类别</option>` +
    categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
  if (categories.includes(selected)) $("categoryFilter").value = selected;
}

function getFilteredRows() {
  const keyword = normalize($("searchInput").value);
  const category = $("categoryFilter").value;
  const status = $("statusFilter").value;
  const maxPapers = Math.max(1, Number($("maxPapers").value || 80));
  return papers.filter(p => {
    const enriched = { ...p, category: inferCategory(p) };
    const text = normalize(JSON.stringify(enriched));
    return (!keyword || text.includes(keyword)) && (!category || inferCategory(p) === category) && (!status || p.status === status);
  }).slice(0, maxPapers);
}

function groupByCategory(rows) {
  const map = new Map();
  rows.forEach(p => {
    const c = inferCategory(p);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(p);
  });
  const order = getCategoryList();
  return Array.from(map.entries()).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

function renderSelectionStats() {
  currentRows = getFilteredRows();
  const categories = new Set(currentRows.map(inferCategory));
  $("selectedCount").textContent = currentRows.length;
  $("selectedCategoryCount").textContent = categories.size;
  $("selectedReferenceCount").textContent = currentRows.length;
  $("selectedSectionHint").textContent = currentRows.length > 0 ? 6 + categories.size : 0;
  setStatus(`当前筛选将使用 ${currentRows.length} / ${papers.length} 篇论文。`);
}

function contributionSentence(p, index) {
  const key = p._bibKey || `paper${index + 1}`;
  const method = truncate(p.method || p.contribution || p.problem || "the proposed method", 120);
  const dataset = truncate(p.dataset || p.metric || "", 100);
  if (dataset) return `${latexEscape(p.title)} studies ${latexEscape(method)} and evaluates it on ${latexEscape(dataset)} \\cite{${key}}.`;
  return `${latexEscape(p.title)} studies ${latexEscape(method)} \\cite{${key}}.`;
}

function markdownContributionSentence(p, index) {
  const method = truncate(p.method || p.contribution || p.problem || "the proposed method", 120);
  const dataset = truncate(p.dataset || p.metric || "", 100);
  const ref = `[${index + 1}]`;
  if (dataset) return `- **${p.title || "Untitled"}** ${ref}: ${method}; datasets/metrics: ${dataset}.`;
  return `- **${p.title || "Untitled"}** ${ref}: ${method}.`;
}

function generateLatex(rows) {
  const title = latexEscape($("reviewTitle").value || "A Survey of Embodied Intelligence Papers");
  const authors = latexEscape($("reviewAuthors").value || "Author Name");
  const keywords = latexEscape($("reviewKeywords").value || "Embodied AI, Vision-Language-Action, Vision-Language Navigation, World Models");
  const language = $("language").value;
  const rowsWithKeys = rows.map((p, i) => ({ ...p, _bibKey: bibKey(p, i) }));
  const groups = groupByCategory(rowsWithKeys);
  const categoryNames = groups.map(([c]) => c).join(", ");
  const abstract = language === "zh"
    ? `本文基于个人论文阅读数据库中的 ${rows.length} 篇论文，围绕 ${categoryNames || "相关方向"} 进行综述。我们从任务定义、模型结构、训练数据、评测指标、主要贡献与局限性等维度进行对比，并进一步总结当前研究中的开放问题与未来方向。`
    : `This survey summarizes ${rows.length} papers from a curated reading database, focusing on ${categoryNames || "embodied intelligence topics"}. We compare these studies from the perspectives of task formulation, model design, datasets, evaluation metrics, contributions, and limitations. We further discuss open challenges and potential future directions.`;
  const taxonomyText = groups.map(([category, items]) => {
    const cites = items.slice(0, 4).map(p => `\\cite{${p._bibKey}}`).join(", ");
    return `\\textbf{${latexEscape(category)}} includes ${items.length} papers, represented by ${cites}.`;
  }).join("\n\n");
  const comparisonRows = rowsWithKeys.map(p => [
      latexEscape(inferCategory(p)),
      `${latexEscape(truncate(p.title, 70))} \\cite{${p._bibKey}}`,
      latexEscape(truncate(p.method || p.contribution || "-", 90)),
      latexEscape(truncate(`${p.dataset || "-"} ${p.metric ? " / " + p.metric : ""}`, 90)),
      latexEscape(truncate(p.takeaway || p.limitation || "-", 90))
    ].join(" & ") + " \\\\"
  ).join("\n");
  const categorySections = groups.map(([category, items]) => {
    const body = items.map((p, i) => contributionSentence(p, i)).join(" ");
    const limitations = items.map(p => truncate(p.limitation || "", 120)).filter(Boolean).slice(0, 4).map(latexEscape).join("; ");
    const limitationText = limitations ? ` The main limitations observed in this category include ${limitations}.` : "";
    return `\\subsection{${latexEscape(category)}}\n${body}${limitationText}`;
  }).join("\n\n");
  const challenges = rowsWithKeys.map(p => p.limitation).filter(Boolean).slice(0, 8).map(x => `\\item ${latexEscape(truncate(x, 180))}`).join("\n");
  const future = rowsWithKeys.map(p => p.takeaway).filter(Boolean).slice(0, 8).map(x => `\\item ${latexEscape(truncate(x, 180))}`).join("\n");
  const bibItems = rowsWithKeys.map(p => {
    const authorsText = latexEscape(p.authors || "Unknown authors");
    const titleText = latexEscape(p.title || "Untitled paper");
    const yearText = latexEscape(p.year || "");
    const linkText = p.link ? ` [Online]. Available: \\url{${latexEscape(p.link)}}` : "";
    return `\\bibitem{${p._bibKey}} ${authorsText}, \\x60\\x60${titleText},'' ${yearText}.${linkText}`.replaceAll("\\x60", "`");
  }).join("\n");
  return `\\documentclass[conference]{IEEEtran}
\\IEEEoverridecommandlockouts

\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{url}
\\usepackage{graphicx}

\\begin{document}

\\title{${title}}

\\author{\\IEEEauthorblockN{${authors}}}

\\maketitle

\\begin{abstract}
${latexEscape(abstract)}
\\end{abstract}

\\begin{IEEEkeywords}
${keywords}
\\end{IEEEkeywords}

\\section{Introduction}
Embodied intelligence has recently attracted increasing attention due to the rapid progress of large-scale vision-language models, action-conditioned policies, world models, and multimodal navigation systems. The papers collected in this reading database cover ${latexEscape(categoryNames || "multiple research directions")}, providing a useful basis for comparing model architectures, supervision signals, datasets, and evaluation protocols.

This survey is generated from a structured paper-reading table. Each entry contains fields such as category, research problem, method, dataset, metric, contribution, limitation, and takeaway. These fields are organized into a taxonomy and comparison table to support literature review writing.

\\section{Taxonomy}
The selected literature can be organized into the following categories.

${taxonomyText || "No category information is available."}

\\begin{table*}[t]
\\centering
\\caption{Comparison of selected papers from the reading database.}
\\label{tab:comparison}
\\scriptsize
\\begin{tabular}{p{0.08\\linewidth} p{0.24\\linewidth} p{0.18\\linewidth} p{0.18\\linewidth} p{0.20\\linewidth}}
\\toprule
Category & Paper & Method & Dataset / Metric & Takeaway / Limitation \\\\
\\midrule
${comparisonRows}
\\bottomrule
\\end{tabular}
\\end{table*}

\\section{Category-wise Review}
${categorySections || "No papers are selected."}

\\section{Open Challenges}
Based on the recorded limitations, several open challenges can be summarized:
\\begin{itemize}
${challenges || "\\item The current database does not contain enough limitation notes. More detailed manual annotations are needed."}
\\end{itemize}

\\section{Future Directions}
The recorded takeaways suggest the following possible future directions:
\\begin{itemize}
${future || "\\item The current database does not contain enough takeaway notes. More detailed manual annotations are needed."}
\\end{itemize}

\\section{Conclusion}
This survey draft provides a structured overview of ${rows.length} selected papers. It should be treated as an editable starting point rather than a final manuscript. Before submission, the author should verify all paper details, complete missing bibliographic metadata, refine the technical claims, and strengthen the critical analysis.

\\begin{thebibliography}{${Math.max(9, rows.length)}}
${bibItems}
\\end{thebibliography}

\\end{document}
`;
}

function generateMarkdown(rows) {
  const title = $("reviewTitle").value || "A Survey of Embodied Intelligence Papers";
  const keywords = $("reviewKeywords").value || "Embodied AI, VLA, VLN, WM, WAM";
  const groups = groupByCategory(rows);
  const categoryNames = groups.map(([c]) => c).join(", ");
  const language = $("language").value;
  const abstract = language === "zh"
    ? `本文基于个人论文阅读数据库中的 ${rows.length} 篇论文，围绕 ${categoryNames || "相关方向"} 进行综述，并从任务、方法、数据集、指标、贡献和局限性等角度进行对比。`
    : `This survey summarizes ${rows.length} papers from a curated reading database, focusing on ${categoryNames || "embodied intelligence topics"}. It compares these studies in terms of tasks, methods, datasets, metrics, contributions, limitations, and takeaways.`;
  const comparison = [
    "| # | Category | Paper | Method | Dataset/Metric | Takeaway |",
    "|---|---|---|---|---|---|",
    ...rows.map((p, i) => `| ${i + 1} | ${inferCategory(p)} | ${p.title || ""} | ${truncate(p.method || p.contribution || "", 90)} | ${truncate(`${p.dataset || ""} ${p.metric || ""}`, 90)} | ${truncate(p.takeaway || p.limitation || "", 90)} |`)
  ].join("\n");
  const categorySections = groups.map(([category, items]) => `## ${category}\n\n` + items.map(p => markdownContributionSentence(p, rows.indexOf(p))).join("\n")).join("\n\n");
  const challenges = rows.map(p => p.limitation).filter(Boolean).slice(0, 10).map(x => `- ${x}`).join("\n") || "- More detailed limitation notes are needed.";
  const future = rows.map(p => p.takeaway).filter(Boolean).slice(0, 10).map(x => `- ${x}`).join("\n") || "- More detailed takeaway notes are needed.";
  const references = rows.map((p, i) => {
    const authors = p.authors || "Unknown authors";
    const year = p.year ? `, ${p.year}` : "";
    const link = p.link ? ` ${p.link}` : "";
    return `[${i + 1}] ${authors}, "${p.title || "Untitled paper"}"${year}.${link}`;
  }).join("\n");
  return `# ${title}

## Abstract

${abstract}

**Keywords:** ${keywords}

## 1. Introduction

Embodied intelligence research increasingly combines perception, language understanding, action generation, navigation, and predictive world modeling. The selected papers cover ${categoryNames || "multiple research directions"} and provide a basis for comparing model design, training data, evaluation metrics, and limitations.

## 2. Taxonomy and Comparison

${comparison}

## 3. Category-wise Review

${categorySections || "No papers are selected."}

## 4. Open Challenges

${challenges}

## 5. Future Directions

${future}

## 6. Conclusion

This draft is generated from a structured paper-reading table. It should be manually revised before submission, especially for technical claims, citation completeness, and critical analysis.

## References

${references}
`;
}

function generatePrompt(rows) {
  const title = $("reviewTitle").value || "A Survey of Embodied Intelligence Papers";
  const language = $("language").value === "zh" ? "中文" : "English";
  const compactRows = rows.map((p, i) => ({
    id: i + 1,
    category: inferCategory(p),
    title: p.title,
    authors: p.authors,
    year: p.year,
    link: p.link,
    topic: p.topic,
    problem: p.problem,
    method: p.method,
    dataset: p.dataset,
    metric: p.metric,
    contribution: p.contribution,
    limitation: p.limitation,
    takeaway: p.takeaway,
    tags: p.tags,
    status: p.status
  }));
  return `请你扮演一名熟悉 IEEE 论文写作的研究者，基于下面的论文阅读表，撰写一篇 IEEE 风格的综述论文草稿。\n\n要求：\n1. 写作语言：${language}\n2. 综述题目：${title}\n3. 结构包括：Abstract, Keywords, Introduction, Taxonomy, Comparison Table, Category-wise Review, Open Challenges, Future Directions, Conclusion, References。\n4. 不要编造论文中没有的信息；如果字段不足，请明确写成“需要补充”。\n5. 按类别组织，如 VLA、VLN、WM、WAM 等。\n6. 参考文献采用 IEEE 编号格式，例如 [1], [2]。\n7. 输出尽量接近可直接改写成 IEEE 论文的风格。\n\n论文阅读表 JSON：\n${JSON.stringify(compactRows, null, 2)}\n`;
}

function generate() {
  currentRows = getFilteredRows();
  if (currentRows.length === 0) {
    $("reviewOutput").value = "当前筛选结果为空，无法生成综述。";
    return;
  }
  const format = $("outputFormat").value;
  let output = "";
  if (format === "latex") output = generateLatex(currentRows);
  if (format === "markdown") output = generateMarkdown(currentRows);
  if (format === "prompt") output = generatePrompt(currentRows);
  $("reviewOutput").value = output;
  renderSelectionStats();
}

async function copyOutput() {
  const text = $("reviewOutput").value;
  if (!text) return setStatus("没有可复制的内容。", true);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("已复制到剪贴板。");
  } catch {
    $("reviewOutput").select();
    document.execCommand("copy");
    setStatus("已尝试复制到剪贴板。");
  }
}

function downloadOutput() {
  const text = $("reviewOutput").value;
  if (!text) return setStatus("没有可下载的内容。", true);
  const format = $("outputFormat").value;
  const ext = format === "latex" ? "tex" : format === "markdown" ? "md" : "txt";
  const filename = `ieee-survey-draft.${ext}`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`已下载 ${filename}。`);
}

["searchInput", "categoryFilter", "statusFilter", "maxPapers"].forEach(id => {
  $(id).addEventListener("input", renderSelectionStats);
  $(id).addEventListener("change", renderSelectionStats);
});
$("reloadBtn").addEventListener("click", loadPapers);
$("generateBtn").addEventListener("click", generate);
$("copyBtn").addEventListener("click", copyOutput);
$("downloadBtn").addEventListener("click", downloadOutput);

loadPapers();
