// Shared, dependency-free data operations used by the interface and tests.
export const UNKNOWN = '__unknown__';
export const STUDY_STAGES = ['COMPLETED_EMPIRICAL','COMPLETED_ANALYTICAL','COMPLETED_COMPUTATIONAL','PROPOSAL','ONGOING','UNDETERMINED'];
export const STAGE_LABELS = {COMPLETED_EMPIRICAL:'已完成实证',COMPLETED_ANALYTICAL:'已完成解析建模',COMPLETED_COMPUTATIONAL:'已完成计算评估',PROPOSAL:'研究计划',ONGOING:'进行中',UNDETERMINED:'阶段未定'};
export const DIMENSIONS = ['topics', 'methods', 'theories', 'study_stage', 'institutions', 'evidence_level', 'review_status'];
export const VIEW_OPTIONS = {heat:['methods','theories'],network_mode:['authors','institutions'],network_weight:['fractional','full'],network_rank:['pagerank','degree','weighteddegree','papers'],network_limit:['30','80','0'],sort:['new','old','title']};
export const clean = v => typeof v === 'string' ? v.trim() : '';
export const unique = values => [...new Set(values.filter(v => v !== null && v !== undefined && v !== ''))];
export function valuesFor(paper, dimension) {
  if (dimension === 'institutions') return unique((paper.authors || []).map(a => clean(a.affiliation || a.institution)).filter(Boolean));
  if (dimension === 'study_stage') return [STUDY_STAGES.includes(paper.study_stage)?paper.study_stage:'UNDETERMINED'];
  if (dimension === 'evidence_level' || dimension === 'review_status') return clean(paper[dimension]) ? [clean(paper[dimension])] : [];
  return unique((Array.isArray(paper[dimension]) ? paper[dimension] : []).map(x => typeof x === 'string' ? clean(x) : clean(x.label)).filter(Boolean));
}
export function filterPapers(papers, state = {}, ignoreYear = false) {
  const query = clean(state.q).toLocaleLowerCase();
  return papers.filter(p => {
    if (!ignoreYear && state.years?.length && !state.years.includes(Number(p.year))) return false;
    if (query && ![p.id, p.title, p.abstract, p._search_text, ...(p.authors || []).map(a => a.name), ...valuesFor(p, 'institutions')].join(' ').toLocaleLowerCase().includes(query)) return false;
    return DIMENSIONS.every(d => {
      const selected = state[d] || [];
      if (!selected.length) return true;
      const values = valuesFor(p, d);
      return selected.some(v => v === UNKNOWN ? values.length === 0 : values.includes(v));
    });
  });
}
export function optionsFor(papers, dimension) {
  const values = unique(papers.flatMap(p => valuesFor(p, dimension))).sort((a,b) => a.localeCompare(b, 'zh-CN'));
  if (papers.some(p => !valuesFor(p, dimension).length)) values.push(UNKNOWN);
  return values;
}
export function counts(papers, dimension) {
  const result = new Map();
  for (const p of papers) for (const v of valuesFor(p, dimension).length ? valuesFor(p, dimension) : [UNKNOWN]) result.set(v, (result.get(v) || 0) + 1);
  return [...result].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
}
export function annualSummary(papers, filtered, years) {
  return years.map(year => {
    const denominator = papers.filter(p => Number(p.year) === Number(year)).length;
    const count = filtered.filter(p => Number(p.year) === Number(year)).length;
    return {year: Number(year), count, denominator, share: denominator ? count / denominator : null};
  });
}
export function annualStageSummary(papers, years) {
  return years.map(year=>{
    const subset=papers.filter(p=>Number(p.year)===Number(year)),total=subset.length;
    return {year:Number(year),total,stages:Object.fromEntries(STUDY_STAGES.map(stage=>{const count=subset.filter(p=>valuesFor(p,'study_stage')[0]===stage).length;return [stage,{count,share:total?count/total:null}];}))};
  });
}
export function heatmap(papers, rowDimension, columnDimension, rowLimit=Infinity, columnLimit=Infinity) {
  const allRows=counts(papers,rowDimension).map(x=>x[0]),allColumns=counts(papers,columnDimension).map(x=>x[0]);
  const rows=allRows.slice(0,rowLimit),columns=allColumns.slice(0,columnLimit),rowSet=new Set(rows),columnSet=new Set(columns),pairs=new Map();
  for(const p of papers){const rv=valuesFor(p,rowDimension),cv=valuesFor(p,columnDimension);for(const row of rv.length?rv:[UNKNOWN])if(rowSet.has(row))for(const col of cv.length?cv:[UNKNOWN])if(columnSet.has(col)){const key=JSON.stringify([row,col]);pairs.set(key,(pairs.get(key)||0)+1);}}
  const cells=rows.map(row=>columns.map(col=>pairs.get(JSON.stringify([row,col]))||0));
  return {rows,columns,cells,totalRows:allRows.length,totalColumns:allColumns.length};
}
export function jointCounts(papers, dimensions = ['topics','methods','theories']) {
  const combinations=new Map();
  for(const p of papers){
    const labels=dimensions.map(d=>valuesFor(p,d).length?valuesFor(p,d):[UNKNOWN]);
    let tuples=[[]];
    for(const values of labels)tuples=tuples.flatMap(tuple=>values.map(v=>[...tuple,v]));
    for(const tuple of tuples){const key=JSON.stringify(tuple),item=combinations.get(key)||{values:tuple,count:0,paper_ids:[]};item.count++;item.paper_ids.push(p.id);combinations.set(key,item);}
  }
  return [...combinations.values()].sort((a,b)=>b.count-a.count || JSON.stringify(a.values).localeCompare(JSON.stringify(b.values),'zh-CN'));
}
export const isResolvedAuthor = a => Boolean(a.author_id) && ['resolved','verified','confirmed','人工已核','已核验','已消歧'].includes(a.identity_status);
export function networkCoverage(papers) {
  const graph=authorGraph(papers),occurrences=graph.nodes.reduce((s,n)=>s+n.papers,0),resolved=graph.nodes.filter(n=>n.resolved).reduce((s,n)=>s+n.papers,0);
  return {total_papers:papers.length,papers_with_authors:papers.filter(p=>(p.authors||[]).some(a=>clean(a.name))).length,author_occurrences:occurrences,resolved_occurrences:resolved,resolved_share:occurrences?resolved/occurrences:null};
}
export function authorGraph(papers, mode = 'authors', weighting = 'fractional') {
  const nodeMap = new Map(), edgeMap = new Map();
  for (const p of papers) {
    const authors = (p.authors || []).map((a, index) => {
      const resolved = isResolvedAuthor(a);
      if (mode === 'institutions') return clean(a.affiliation || a.institution) ? {id: a.institution_id || `institution:${clean(a.affiliation || a.institution)}`, label: clean(a.affiliation || a.institution), resolved: Boolean(a.institution_id)} : null;
      return clean(a.name) ? {id: resolved ? a.author_id : `unresolved:${p.id}:${index}`, label: clean(a.name), resolved} : null;
    }).filter(Boolean);
    const members = [...new Map(authors.map(a => [a.id, a])).values()];
    for (const a of members) {
      const node = nodeMap.get(a.id) || {...a, papers: 0, paper_ids: []};
      node.papers++; node.paper_ids.push(p.id); nodeMap.set(a.id, node);
    }
    for (let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++) {
      const ids = [members[i].id, members[j].id].sort(), key = JSON.stringify(ids);
      const edge = edgeMap.get(key) || {source: ids[0], target: ids[1], weight: 0, full_count: 0, paper_ids: []};
      edge.weight += weighting === 'full' ? 1 : 1 / (members.length - 1);
      edge.full_count++; edge.paper_ids.push(p.id); edgeMap.set(key, edge);
    }
  }
  return {nodes: [...nodeMap.values()].sort((a,b)=>b.papers-a.papers || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), edges: [...edgeMap.values()], weighting};
}
export function pageRank(graph, damping = .85, tolerance = 1e-12, maxIterations = 10000) {
  if (!(damping > 0 && damping < 1)) throw new Error('damping must lie in (0,1)');
  const ids = graph.nodes.map(n => n.id), n = ids.length, index = new Map(ids.map((id,i)=>[id,i]));
  if (!n) return {scores: {}, iterations:0, residual:0, sum:0, converged:true, damping};
  const adjacency = ids.map(()=>[]), degree = new Float64Array(n);
  for (const e of graph.edges) {
    const i=index.get(e.source), j=index.get(e.target);
    if (i === undefined || j === undefined || i === j || !(e.weight > 0)) continue;
    adjacency[i].push([j,e.weight]); adjacency[j].push([i,e.weight]); degree[i]+=e.weight; degree[j]+=e.weight;
  }
  const step = rank => {
    const next = new Float64Array(n); let dangling=0;
    for(let i=0;i<n;i++) if (!degree[i]) dangling += rank[i];
    next.fill((1-damping)/n + damping*dangling/n);
    for(let i=0;i<n;i++) if(degree[i]) for(const [j,w] of adjacency[i]) next[j]+=damping*rank[i]*w/degree[i];
    return next;
  };
  let rank = new Float64Array(n).fill(1/n), iterations=0, delta=Infinity;
  while(iterations<maxIterations && delta>tolerance) {
    const next=step(rank); delta=next.reduce((s,v,i)=>s+Math.abs(v-rank[i]),0); rank=next; iterations++;
  }
  const next=step(rank), residual=next.reduce((s,v,i)=>s+Math.abs(v-rank[i]),0);
  return {scores: Object.fromEntries(ids.map((id,i)=>[id,rank[i]])), iterations, residual, sum:rank.reduce((s,v)=>s+v,0), converged:residual<=tolerance, damping};
}
export function rankGraph(graph, mode = 'pagerank', damping = .85) {
  const pr = pageRank(graph,damping), degree = new Map(graph.nodes.map(n=>[n.id,0])), strength=new Map(degree);
  for(const e of graph.edges) for(const id of [e.source,e.target]) {degree.set(id,(degree.get(id)||0)+1);strength.set(id,(strength.get(id)||0)+e.weight);}
  const ranking = graph.nodes.map(n=>({...n,pagerank:pr.scores[n.id],degree:degree.get(n.id),weighteddegree:strength.get(n.id)}));
  ranking.sort((a,b)=>(b[mode] ?? b.pagerank)-(a[mode] ?? a.pagerank) || (a.id<b.id?-1:a.id>b.id?1:0));
  return {ranking, diagnostics:pr};
}
export function rankingCSV(result, context = {}, options = {}) {
  const fields=['rank','author_id','name','identity_status','papers','degree','weighteddegree','pagerank','metric','edge_weighting','damping','filter_query','n_nodes','n_edges','dataset_version'];
  const rows=result.ranking.map((n,i)=>[i+1,n.id,n.label,n.resolved?'resolved':'unresolved',n.papers,n.degree,n.weighteddegree,n.pagerank,context.metric||'pagerank',context.weighting||'',result.diagnostics.damping,context.filter_query||'',result.ranking.length,context.edges??'',context.version||'']);
  return '\ufeff'+[fields.map(f=>options.headerLabel?options.headerLabel(f):f),...rows.map(row=>row.map((v,i)=>options.cellValue?options.cellValue(v,fields[i]):v))].map(r=>r.map(v=>csvQuote(v)).join(',')).join('\r\n');
}
export function csvQuote(value) {
  let v=String(value??'');
  if (typeof value==='string' && /^[\s]*[=+@\-]/.test(v)) v="'"+v;
  return '"'+v.replace(/"/g,'""')+'"';
}
export function toCSV(papers, options = {}) {
  const fields = ['id','year','title','authors','institutions','topics','methods','theories','study_stage','stage_evidence_level','stage_confidence','stage_conflict','evidence_level','review_status','source_id','page_start','page_end'];
  const quote = csvQuote;
  const rows = papers.map(p => fields.map(f => {
    let value=p[f];
    if(f==='authors')value=(p.authors||[]).map(a=>a.name).join(' | ');
    if(['institutions','topics','methods','theories'].includes(f))value=valuesFor(p,f).join(' | ');
    if(f==='study_stage')value=valuesFor(p,f)[0];
    if(f==='stage_conflict'&&p[f]&&typeof p[f]==='object')value=Array.isArray(p[f])?p[f].join(' | '):JSON.stringify(p[f]);
    return quote(options.cellValue?options.cellValue(value,f):value);
  }).join(','));
  return '\ufeff' + [fields.map(f=>quote(options.headerLabel?options.headerLabel(f):f)).join(','), ...rows].join('\r\n');
}
export function stateToQuery(state) {
  const q = new URLSearchParams();
  if(['en','zh'].includes(state.lang))q.set('lang',state.lang);
  if (clean(state.q)) q.set('q', clean(state.q));
  for (const d of ['years',...DIMENSIONS]) for (const value of [...(state[d] || [])].sort()) q.append(d, value);
  if (state.mode === 'share') q.set('mode','share');
  for(const [key,allowed] of Object.entries(VIEW_OPTIONS)) if(state[key] && state[key]!==allowed[0])q.set(key,state[key]);
  for(const key of ['compare_a','compare_b'])if(state[key]!==undefined)q.set(key,state[key]);
  return q.toString();
}
export function queryToState(search, papers, years) {
  const query = new URLSearchParams(search), state = {q: query.get('q') || '', mode: query.get('mode') === 'share' ? 'share' : 'count'};
  if(['en','zh'].includes(query.get('lang')))state.lang=query.get('lang');
  state.years = unique(query.getAll('years').map(Number).filter(y => years.includes(y)));
  for (const dimension of DIMENSIONS) {
    const allowed = optionsFor(papers, dimension);
    state[dimension] = unique(query.getAll(dimension).filter(value => allowed.includes(value)));
  }
  for(const [key,allowed] of Object.entries(VIEW_OPTIONS))state[key]=allowed.includes(query.get(key))?query.get(key):allowed[0];
  state.compare_a=years.includes(Number(query.get('compare_a')))?Number(query.get('compare_a')):years[0];
  state.compare_b=years.includes(Number(query.get('compare_b')))?Number(query.get('compare_b')):years.at(-1);
  return state;
}
export function validateDataset(data) {
  const errors = [], warnings = [];
  if (!data || !Array.isArray(data.papers)) return {valid:false, errors:['papers must be an array'], warnings};
  if(data.years!==undefined && (!Array.isArray(data.years)||data.years.some(y=>!Number.isInteger(y))))errors.push('years must be an integer array');
  if(data.coverage!==undefined && !Array.isArray(data.coverage))errors.push('coverage must be an array');
  const ids = new Set();
  data.papers.forEach((p,i) => {
    if(!p||typeof p!=='object'){errors.push(`paper ${i}: record must be an object`);return;}
    if (!clean(p.id) || ids.has(p.id)) errors.push(`paper ${i}: missing or duplicate id`);
    ids.add(p.id);
    if (!Number.isInteger(p.year)) errors.push(`${p.id}: year must be integer`);
    if (Array.isArray(data.years) && !data.years.includes(p.year)) errors.push(`${p.id}: year outside declared coverage`);
    if (!clean(p.title)) errors.push(`${p.id}: missing title`);
    if(p.study_stage!==undefined && p.study_stage!==null && !STUDY_STAGES.includes(p.study_stage))errors.push(`${p.id}: study_stage outside declared categories`);
    if(typeof p.stage_confidence==='number' && (!Number.isFinite(p.stage_confidence)||p.stage_confidence<0||p.stage_confidence>1))errors.push(`${p.id}: numeric stage_confidence must lie in [0,1]`);
    for(const d of ['authors','topics','methods','theories','evidence']) if (p[d] !== undefined && !Array.isArray(p[d])) errors.push(`${p.id}: ${d} must be array`);
    for(const d of ['topics','methods','theories'])if(Array.isArray(p[d]) && p[d].some(v=>!(typeof v==='string' || v&&typeof v.label==='string')))errors.push(`${p.id}: ${d} labels must be text`);
    if(Array.isArray(p.authors)&&p.authors.some(a=>!a||typeof a!=='object'))errors.push(`${p.id}: authors must contain objects`);
    if (!p.source_id) warnings.push(`${p.id}: source_id missing`);
    for(const e of Array.isArray(p.evidence)?p.evidence:[]) {
      if(!e||typeof e!=='object'){errors.push(`${p.id}: evidence must contain objects`);continue;}
      if(e.pdf_page !== null && e.pdf_page !== undefined && (!Number.isInteger(e.pdf_page)||e.pdf_page<1))errors.push(`${p.id}: evidence pdf_page must be a positive physical page or null`);
    }
  });
  for(const c of Array.isArray(data.coverage)?data.coverage:[]) {
    if(!c||typeof c!=='object'){errors.push('coverage must contain objects');continue;}
    const actual=data.papers.filter(p=>p&&p.year===c.year).length;
    if(c.collected_papers!==undefined && c.collected_papers!==actual) errors.push(`${c.year}: collected_papers differs from paper index`);
    if(c.expected_papers!==null && c.expected_papers!==undefined && c.expected_papers<actual) warnings.push(`${c.year}: collected exceeds declared expected total; review denominator`);
  }
  return {valid: !errors.length, errors, warnings};
}
