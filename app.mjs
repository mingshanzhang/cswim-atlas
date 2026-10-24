import {UNKNOWN,DIMENSIONS,STUDY_STAGES,STAGE_LABELS,valuesFor,filterPapers,optionsFor,counts,annualSummary,annualStageSummary,heatmap,jointCounts,networkCoverage,authorGraph,rankGraph,rankingCSV,toCSV,csvQuote,stateToQuery,queryToState,validateDataset} from './core.mjs';

const $ = s => document.querySelector(s);
const labels={years:'年份',topics:'研究主题',methods:'研究方法',theories:'理论与机制',study_stage:'研究阶段',institutions:'署名机构',evidence_level:'证据状态',review_status:'复核状态'};
const displayLabels={...STAGE_LABELS,TITLE_ONLY:'题名级',title_only:'题名级',ABSTRACT_ONLY:'摘要级',abstract_only:'摘要级',abstract:'摘要级',FULLTEXT:'全文证据',fulltext:'全文证据',FULLTEXT_REVIEWED:'正文已复核',fulltext_reviewed:'正文已复核',BODY_REVIEWED:'正文已复核',body_reviewed:'正文已复核',DRAFT:'草稿编码',draft:'草稿编码',UNREVIEWED:'待复核',unreviewed:'待复核',REVIEWED:'已复核',reviewed:'已复核',double_coded:'独立复核',HIGH:'高',high:'高',MEDIUM:'中',medium:'中',LOW:'低',low:'低'};
Object.assign(displayLabels,{unverified_archive_candidate_abstract:'摘要候选，待复核',abstract_unavailable:'摘要未取得',candidate_mismatch:'候选记录不一致',toc_only:'目录级',abstract_and_body_excerpt:'摘要＋正文选段',reported:'材料报告',unknown:'未核',partial:'部分提取',metadata:'题录',research_design:'研究设计',estimator:'估计方法',theory_name:'理论名称',constructs:'构念'});
const show = value => value===UNKNOWN?'未核 / 未提取':displayLabels[value]||String(value);
const number = n => Number(n).toLocaleString('zh-CN');
const pct = n => n===null?'—':`${(n*100).toFixed(1)}%`;
const text = (tag, value, cls='') => {const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
function append(parent, ...nodes){for(const node of nodes) if(node!==null&&node!==undefined)parent.append(node);return parent;}
function empty(parent, title, subtitle=''){const e=text('div','', 'empty');append(e,text('strong',title),text('span',subtitle));parent.replaceChildren(e);}
function svgElement(name,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;}
function svgText(parent,value,x,y,attrs={}){const e=svgElement('text',{x,y,...attrs});e.textContent=value;parent.append(e);return e;}
function tags(values, cls='mini-tags'){const e=text('div','',cls);for(const value of values)e.append(text('span',show(value),'mini-tag'));return e;}
function richValue(value){
  if(Array.isArray(value)){const list=text('ul','','structured-list');for(const item of value)append(list,append(document.createElement('li'),richValue(item)));return list;}
  if(value&&typeof value==='object'){const terms={model_family:'模型类别',model_type:'模型类型',unit:'分析单位',actors:'参与者',constructs:'构念',mechanism:'机制',relationships:'变量关系',hypotheses:'假设',objective:'目标函数',state_variables:'状态变量',decision_variables:'决策变量',constraints:'约束',equilibrium:'均衡',identification:'识别',estimation:'估计方法',estimator:'估计方法',measurement_tool:'测量工具',analytical_model:'分析模型',research_stage:'研究进展',research_design:'研究设计',specification:'模型设定',dependent_variables:'因变量',independent_variables:'自变量',data:'数据',evidence:'证据',evidence_refs:'证据位置',evidence_note:'证据说明',quote:'摘录或归纳',pdf_page:'PDF物理页',source_id:'来源ID',status:'状态',theory_model:'理论模型',explicit_theory_and_lens:'理论与分析视角',variables_and_tests:'变量与检验',topic_primary:'主要主题',topic_secondary:'次要主题',technology:'技术情境',theory_name:'理论名称',theory_role:'理论作用',analysis_level:'分析层级',iv:'自变量',dv:'因变量',mediator:'中介变量',moderator:'调节变量',boundary:'边界条件',relation_direction:'关系方向',claim_status:'结论状态',evidence_status:'证据状态',auxiliary_lenses:'辅助视角'};const list=text('dl','','model-fields');for(const [key,v] of Object.entries(value)){if(v===null||v===undefined||v===''||Array.isArray(v)&&!v.length)continue;append(list,text('dt',terms[key]||key),append(document.createElement('dd'),richValue(v)));}return list;}
  return text('span',value===null||value===undefined?'未核':show(value));
}
function stageConflictText(value){if(value===null||value===undefined)return '未核';if(value===false||value==='NONE'||value==='none'||value==='NO_CONFLICT'||Array.isArray(value)&&!value.length)return '未标记冲突';if(value===true)return '存在冲突，待裁决';return null;}
let dataset, papers=[], years=[], state={}, selected=[], page=1, jointPage=1, currentRanking=null;
const pageSize=15;

function sourceLink(sourceID, pageNumber, directURL) {
  const source=Array.isArray(dataset.sources)?dataset.sources.find(s=>(s.id||s.source_id)===sourceID):dataset.sources?.[sourceID];
  const url=directURL||source?.url||source?.source_url;
  if(!url) return text('span',`${sourceID||'来源待核'}${pageNumber?` · PDF物理页 ${pageNumber}`:''}`);
  const a=text('a',`${sourceID||'原文'}${pageNumber?` · PDF物理页 ${pageNumber}`:''}`);
  try{const u=new URL(url,location.href);if(!['http:','https:'].includes(u.protocol))return text('span',sourceID||'来源待核');if(pageNumber&&!u.hash)u.hash=`page=${pageNumber}`;a.href=u.href;}catch{return text('span',sourceID||'来源待核');}
  a.target='_blank';a.rel='noopener noreferrer';return a;
}
function openDialog(kicker, children) {
  $('#detail-kicker').textContent=kicker;$('#detail-content').replaceChildren(...children);
  if(!$('#detail').open)$('#detail').showModal();
}
function paperDetails(p) {
  const nodes=[text('h2',p.title),text('p',`${p.year} · ${p.id} · ${(p.authors||[]).map(a=>a.name).join(' / ')||'作者待核'}`)];
  const grid=text('div','','detail-grid');
  for(const [d,label] of [['topics','主题'],['methods','方法'],['theories','理论'],['institutions','机构']]){
    const cell=text('div','');append(cell,text('small',label),text('p',valuesFor(p,d).join(' / ')||'未核 / 未提取'));grid.append(cell);
  }
  nodes.push(grid);
  nodes.push(text('h3','研究阶段'));
  const stage=text('div','','stage-detail');append(stage,text('span',show(valuesFor(p,'study_stage')[0]),'stage-badge'),text('span',`证据：${p.stage_evidence_level?show(p.stage_evidence_level):'未核'}${p.stage_confidence!==undefined&&p.stage_confidence!==null?` · ${typeof p.stage_confidence==='number'?`把握度：${pct(p.stage_confidence)}`:`依据状态：${show(p.stage_confidence)}`}`:''}`,'source-line'));nodes.push(stage);
  const conflict=stageConflictText(p.stage_conflict);if(conflict!==null)nodes.push(text('p',conflict,'source-line'));else nodes.push(text('h3','阶段判定冲突'),richValue(p.stage_conflict));
  if(p.model_fields&&Object.keys(p.model_fields).length)nodes.push(text('h3','模型与研究设计'),richValue(p.model_fields));
  if(p.abstract)nodes.push(text('h3','摘要'),text('p',p.abstract,'abstract'));
  nodes.push(text('h3','分类证据'));
  if(!p.evidence?.length)nodes.push(text('p','该条目暂未附可定位的分类证据。'));
  for(const e of p.evidence||[]){
    const item=text('div','','evidence-item');append(item,text('div',`${labels[e.dimension]||e.dimension||'证据'} · ${e.label?show(e.label):'待核'}`,'evidence-top'));
    if(e.quote){item.append(text('small',e.evidence_type==='paraphrase'?'内容归纳':e.evidence_type==='verbatim'?'原文摘录':'摘录或归纳','source-line'));item.append(text('blockquote',e.quote));}
    if(e.rationale)item.append(text('p',e.rationale));
    const src=text('div','','source-line');src.append(sourceLink(e.source_id||p.source_id,e.pdf_page,e.source_url||p.source_url));item.append(src);nodes.push(item);
  }
  nodes.push(text('h3','记录与原文'));
  const src=text('p','','source-line');append(src,sourceLink(p.source_id,p.page_start,p.source_url),text('span',` · 终页 ${p.page_end??'未核'} · ${p.evidence_level?show(p.evidence_level):'证据状态未核'} · ${p.review_status?show(p.review_status):'复核状态未核'}`));nodes.push(src);
  if(p.coding_notes)nodes.push(text('p',p.coding_notes));
  openDialog('PAPER / EVIDENCE',nodes);
}
function setState(next){state={...state,...next};page=1;jointPage=1;syncURL();render();}
function syncURL(replace=false){const query=stateToQuery(state),url=location.pathname+(query?'?'+query:'')+location.hash;if(url!==location.pathname+location.search+location.hash)history[replace?'replaceState':'pushState'](null,'',url);}
function syncControls(){for(const [key,id] of Object.entries({heat:'heat-dimension',compare_a:'compare-a',compare_b:'compare-b',network_mode:'network-mode',network_limit:'network-limit',network_weight:'network-weight',network_rank:'network-rank',sort:'sort'}))if(state[key]!==undefined)$('#'+id).value=state[key];}
function renderFilters(){
  const container=$('#filters');container.replaceChildren();$('#query').value=state.q||'';
  for(const dimension of ['years',...DIMENSIONS]){
    const group=text('details','','filter-group');group.open=['years','topics','methods'].includes(dimension);
    group.append(text('summary',labels[dimension]));const options=text('div','','options');
    const values=dimension==='years'?years:optionsFor(papers,dimension),nMap=dimension==='years'?new Map(years.map(y=>[y,papers.filter(p=>p.year===y).length])):new Map(counts(papers,dimension));
    let limit=50,search=null;
    if(values.length>20){search=document.createElement('input');search.type='search';search.placeholder='查找'+labels[dimension]+'标签';search.className='facet-search';search.setAttribute('aria-label','查找'+labels[dimension]+'标签');group.append(search);search.oninput=()=>{limit=50;renderOptions();};}
    function renderOptions(){options.replaceChildren();const query=(search?.value||'').trim().toLocaleLowerCase(),matches=values.filter(v=>show(v).toLocaleLowerCase().includes(query)),visible=matches.slice(0,limit);
    if(!visible.length)options.append(text('span',values.length?'没有匹配标签':'暂无可用标签','small-note'));
    for(const value of visible){
      const label=text('label','','check'),input=document.createElement('input');input.type='checkbox';input.value=value;input.checked=(state[dimension]||[]).includes(value);input.setAttribute('aria-label',`${labels[dimension]}：${show(value)}`);
      input.addEventListener('change',()=>{const values=[...(state[dimension]||[])];setState({[dimension]:input.checked?[...values,value]:values.filter(v=>v!==value)});});
      const n=nMap.get(value)||0;
      append(label,input,text('span',show(value)),text('small',number(n),'option-count'));options.append(label);
    }
    if(matches.length>limit){const more=text('button',`显示更多（${Math.min(limit,matches.length)} / ${matches.length}）`,'text-button');more.onclick=()=>{limit+=50;renderOptions();};options.append(more);}
    }renderOptions();
    group.append(options);container.append(group);
  }
}
function renderActive(){
  const target=$('#active-filters');target.replaceChildren();
  for(const d of ['years',...DIMENSIONS])for(const v of state[d]||[]){const chip=text('span',`${labels[d]}：${show(v)}`,'filter-chip'),b=text('button','×');b.setAttribute('aria-label',`移除${show(v)}`);b.onclick=()=>setState({[d]:state[d].filter(x=>x!==v)});append(chip,b);target.append(chip);}
  if(state.q){const chip=text('span',`搜索：${state.q}`,'filter-chip'),b=text('button','×');b.setAttribute('aria-label','清除搜索');b.onclick=()=>{$('#query').value='';setState({q:''});};append(chip,b);target.append(chip);}
}
function renderMetrics(){
  const topicCount=optionsFor(selected,'topics').filter(x=>x!==UNKNOWN).length;
  const methodCount=optionsFor(selected,'methods').filter(x=>x!==UNKNOWN).length;
  const evidenceCount=selected.filter(p=>(p.evidence||[]).some(e=>e.quote&&e.pdf_page)).length;
  const items=[['当前论文',selected.length,`全库 ${number(papers.length)} 篇`,'↗'],['研究主题',topicCount,'多标签主题数','⌘'],['研究方法',methodCount,'已提取方法数','◈'],['附原页证据',evidenceCount,`当前论文的 ${pct(selected.length?evidenceCount/selected.length:null)}`,'▤']];
  $('#metrics').replaceChildren(...items.map(([label,value,sub,icon])=>{const e=text('div','','metric');return append(e,text('div',label,'metric-label'),text('div',number(value),'metric-value'),text('div',sub,'metric-sub'),text('span',icon,'metric-icon'));}));
}
function renderTrend(){
  const target=$('#trend');target.replaceChildren();const visibleYears=state.years?.length?years.filter(y=>state.years.includes(y)):years;
  const rows=annualSummary(papers,selected,visibleYears), share=state.mode==='share';
  document.querySelectorAll('[name=trend-mode]').forEach(i=>i.checked=i.value===state.mode);
  const svg=svgElement('svg',{viewBox:'0 0 460 230',role:'img','aria-label':rows.map(r=>`${r.year}年 ${r.count}篇 / 已采集${r.denominator}篇${share?`，占${pct(r.share)}`:''}`).join('；')});
  const max=share?1:Math.max(1,...rows.map(r=>r.count))*1.15,left=37,base=192,width=400,top=22,height=155;
  for(let i=0;i<=4;i++){const y=base-height*i/4;svg.append(svgElement('line',{x1:left,y1:y,x2:left+width,y2:y}));svgText(svg,share?`${i*25}%`:Math.round(max*i/4),left-8,y+3,{'text-anchor':'end'});}
  const slot=width/Math.max(rows.length,1);
  rows.forEach((r,i)=>{const v=share?(r.share||0):r.count,h=v/max*height,x=left+slot*i+slot*.24,bw=slot*.52;const rect=svgElement('rect',{x,y:base-h,width:bw,height:Math.max(h,1),rx:4,fill:i===rows.length-1?'#087f73':'#b6d6c8',tabindex:0,role:'button','aria-label':`${r.year}年${r.count}篇，点击筛选该年`});const title=svgElement('title');title.textContent=`${r.year}：${r.count} / ${r.denominator}，${pct(r.share)}`;rect.append(title);rect.onclick=()=>setState({years:[r.year]});rect.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setState({years:[r.year]});}};svg.append(rect);svgText(svg,share?pct(r.share):number(r.count),x+bw/2,base-h-9,{'text-anchor':'middle',class:'value'});svgText(svg,r.year,x+bw/2,base+22,{'text-anchor':'middle'});});target.append(svg);
}
function renderStages(){
  const target=$('#stage-breakdown'),visibleYears=state.years?.length?years.filter(y=>state.years.includes(y)):years,rows=annualStageSummary(selected,visibleYears);target.replaceChildren();
  const table=text('table','','stage-table'),head=document.createElement('thead');head.append(append(document.createElement('tr'),...['年度','当前篇数',...STUDY_STAGES.map(s=>show(s))].map(x=>text('th',x))));table.append(head);const body=document.createElement('tbody');
  for(const row of rows){const tr=document.createElement('tr');append(tr,text('th',row.year),text('td',row.total));for(const stage of STUDY_STAGES){const cell=document.createElement('td'),v=row.stages[stage],b=text('button',`${v.count} · ${pct(v.share)}`,'stage-count');b.style.setProperty('--stage-color',({COMPLETED_EMPIRICAL:'#087f73',COMPLETED_ANALYTICAL:'#5e9666',COMPLETED_COMPUTATIONAL:'#548ba2',PROPOSAL:'#b67a48',ONGOING:'#a49a42',UNDETERMINED:'#88938e'})[stage]);b.setAttribute('aria-label',`${row.year}年${show(stage)}：${v.count}篇，占${pct(v.share)}，点击筛选`);b.onclick=()=>setState({years:[row.year],study_stage:[stage]});cell.append(b);tr.append(cell);}body.append(tr);}table.append(body);target.append(table);
}
function renderTopics(){
  const target=$('#topics');const data=counts(selected,'topics').slice(0,7);target.replaceChildren();
  if(!data.length)return empty(target,'暂无主题记录','调整筛选后继续探索');const max=Math.max(...data.map(x=>x[1]));
  for(const [label,count] of data){const row=text('button','','bar-row'),labelNode=text('span',show(label),'bar-label');labelNode.title=show(label);row.setAttribute('aria-label',`${show(label)}：${count}篇，点击筛选`);row.onclick=()=>setState({topics:[label]});const track=text('div','','bar-track'),fill=text('div','','bar-fill');fill.style.width=`${count/max*100}%`;track.append(fill);append(row,labelNode,track,text('span',number(count),'bar-number'));target.append(row);}
}
function renderHeatmap(){
  const target=$('#heatmap'),dimension=$('#heat-dimension').value, model=heatmap(selected,'topics',dimension,20,12);target.replaceChildren();
  if(!model.rows.length)return empty(target,'暂无交叉记录','调整主题或方法条件');
  target.append(text('p',`当前显示 ${model.rows.length} / ${model.totalRows} 个主题、${model.columns.length} / ${model.totalColumns} 个${dimension==='methods'?'方法':'理论'}标签；按计数排序，可用左侧标签搜索缩小范围。`,'small-note'));
  const table=text('table','','heat-table'),head=document.createElement('thead'),tr=document.createElement('tr');append(tr,text('th','主题 / '+labels[dimension]));for(const c of model.columns)tr.append(text('th',show(c)));head.append(tr);table.append(head);
  const body=document.createElement('tbody'),max=Math.max(1,...model.cells.flat());
  model.rows.forEach((row,i)=>{const tr=document.createElement('tr'),th=text('th',show(row));th.scope='row';tr.append(th);model.columns.forEach((col,j)=>{const td=document.createElement('td'),value=model.cells[i][j],button=text('button',number(value),'heat-cell');button.style.background=value?`rgba(8,127,115,${.08+.7*value/max})`:'#f5f7f5';button.style.color=value/max>.6?'white':'#4c7765';button.setAttribute('aria-label',`${show(row)} × ${show(col)}：${value}篇，点击筛选`);button.onclick=()=>setState({topics:[row],[dimension]:[col]});td.append(button);tr.append(td);});body.append(tr);});table.append(body);target.append(table);
}
function renderJoint(){
  const target=$('#joint-combinations'),rows=jointCounts(selected),pages=Math.max(1,Math.ceil(rows.length/15));jointPage=Math.min(jointPage,pages);target.replaceChildren();
  if(!rows.length)empty(target,'暂无三维组合','调整筛选后查看主题、方法与理论的共同出现。');
  else{
    const table=text('table','','joint-table'),head=document.createElement('thead');head.append(append(document.createElement('tr'),...['主题','方法','理论','篇数','占当前论文',''].map(x=>text('th',x))));table.append(head);const body=document.createElement('tbody');
    for(const row of rows.slice((jointPage-1)*15,jointPage*15)){const tr=document.createElement('tr'),button=text('button','筛选 →','text-button');button.setAttribute('aria-label',`筛选三维组合：${row.values.map(show).join('、')}`);button.onclick=()=>setState({topics:[row.values[0]],methods:[row.values[1]],theories:[row.values[2]]});append(tr,...row.values.map(v=>text('td',show(v))),text('td',row.count),text('td',pct(row.count/selected.length)),append(document.createElement('td'),button));body.append(tr);}table.append(body);target.append(table);
  }
  $('#joint-prev').disabled=jointPage<=1;$('#joint-next').disabled=jointPage>=pages;$('#joint-page-status').textContent=`${number(rows.length)} 个组合 · 第 ${jointPage} / ${pages} 页`;
}
function renderComparison(){
  const target=$('#comparison'),a=Number($('#compare-a').value),b=Number($('#compare-b').value),base=filterPapers(papers,state,true);const grid=text('div','','compare-grid');
  for(const year of [a,b]){const ps=base.filter(p=>p.year===year),box=text('div','','year-summary');append(box,append(text('div',String(year),'year-title'),text('span',`${number(ps.length)} 篇 / 已采集 ${number(papers.filter(p=>p.year===year).length)} 篇`)));
    for(const [dimension,label] of [['topics','主要主题'],['methods','研究方法'],['theories','理论线索']]){box.append(text('h4',label));const values=counts(ps,dimension).slice(0,4);box.append(tags(values.map(([v,n])=>`${show(v)} · ${n}`)));if(!values.length)box.append(text('span','暂无记录','small-note'));}grid.append(box);
  }target.replaceChildren(grid);renderRankingComparison();
}
function renderNetwork(){
  const mode=$('#network-mode').value,weighting=$('#network-weight').value,rankMode=$('#network-rank').value,graph=authorGraph(selected,mode,weighting),result=rankGraph(graph,rankMode),limit=Number($('#network-limit').value)||Infinity,shown=result.ranking.slice(0,limit),ids=new Set(shown.map(n=>n.id)),edges=graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));currentRanking={...result,edges:graph.edges.length};
  const target=$('#network');target.replaceChildren();
  $('#network-note').textContent=`当前全图 ${number(graph.nodes.length)} 个${mode==='authors'?'作者':'机构'}节点 · ${number(graph.edges.length)} 条边 · ${weighting==='fractional'?'分数计权':'完整计权'}`;
  const coverage=networkCoverage(selected);$('#network-coverage').textContent=`有署名论文 ${coverage.papers_with_authors} / ${coverage.total_papers} · 身份已核 ${coverage.resolved_occurrences} / ${coverage.author_occurrences} 次署名（${pct(coverage.resolved_share)}）`;
  if(!shown.length){empty(target,'暂无合作记录','作者或机构署名尚未取得');$('#ranking').replaceChildren();return;}
  const wrap=text('div','','network-wrap'),svg=svgElement('svg',{viewBox:'0 0 820 420',role:'img','aria-label':`合作网络显示${shown.length}个节点，点击节点查看对应论文`}),pos=new Map(),n=shown.length;
  shown.forEach((node,i)=>{const ring=i<12?128:181,angle=-Math.PI/2+2*Math.PI*(i<12?i/Math.min(n,12):(i-12)/Math.max(n-12,1));pos.set(node.id,{x:n===1?410:410+Math.cos(angle)*ring*(n<5?1.2:1.7),y:n===1?210:210+Math.sin(angle)*ring*.88});});
  const maxWeight=Math.max(1,...edges.map(e=>e.weight));
  for(const e of edges){const a=pos.get(e.source),b=pos.get(e.target),line=svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,'stroke-width':.6+e.weight/maxWeight*2,class:'network-edge'});svg.append(line);}
  shown.forEach((node,i)=>{const p=pos.get(node.id),g=svgElement('g',{class:`network-node${node.resolved?'':' unresolved'}`,tabindex:0,role:'button','aria-label':`${node.label}，${node.papers}篇论文，PageRank ${node.pagerank.toFixed(6)}${node.resolved?'':'，未消歧'}`}),radius=6+Math.sqrt(node.papers)*3,title=svgElement('title');title.textContent=`${node.label}\n${node.id}\n论文 ${node.papers} / 合作者 ${node.degree} / 合作强度 ${node.weighteddegree.toFixed(3)}\nPageRank ${node.pagerank.toFixed(6)}`;append(g,title,svgElement('circle',{cx:p.x,cy:p.y,r:radius}));
    if(i<30)svgText(g,node.label.length>15?node.label.slice(0,14)+'…':node.label,p.x,p.y+radius+13,{'text-anchor':'middle'});
    const open=()=>{const ps=selected.filter(p=>node.paper_ids.includes(p.id)),items=[text('h2',node.label),text('p',`${node.id} · ${node.resolved?'已登记身份ID':'未消歧，逐篇独立记录'} · 当前 ${ps.length} 篇论文`)];for(const p of ps){const b=text('button',`${p.year} · ${p.title}`,'paper-title');b.onclick=()=>paperDetails(p);items.push(b);}openDialog('COLLABORATION / PAPERS',items);};g.onclick=open;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};svg.append(g);});
  wrap.append(svg);target.append(wrap);const legend=text('div','','network-legend');append(legend,text('span',`显示 ${shown.length} / ${graph.nodes.length} 个节点 · 排名由筛选后的完整图重算`),text('span','实心：已登记身份ID　虚线：未消歧'));target.append(legend);
  const diagnostic=text('div',`PageRank d=0.85 · 迭代 ${result.diagnostics.iterations} 次 · 残差 ${result.diagnostics.residual.toExponential(2)} · 总和 ${result.diagnostics.sum.toFixed(10)}`,'network-status');target.append(diagnostic);
  const table=text('table',''),head=document.createElement('thead');head.append(append(document.createElement('tr'),...['名次','作者 / 机构','PageRank','合作者数','合作强度','论文数'].map(x=>text('th',x))));table.append(head);const body=document.createElement('tbody');
  result.ranking.slice(0,20).forEach((node,i)=>{const tr=document.createElement('tr'),name=text('td',node.label);name.append(text('div',node.id,'rank-id'));append(tr,text('td',i+1),name,text('td',node.pagerank.toFixed(6)),text('td',node.degree),text('td',node.weighteddegree.toFixed(3)),text('td',node.papers));body.append(tr);});table.append(body);$('#ranking').replaceChildren(table);renderRankingComparison();
}
function renderRankingComparison(){
  if(!dataset)return;const mode=$('#network-mode').value,weighting=$('#network-weight').value,rankMode=$('#network-rank').value,base=filterPapers(papers,state,true),a=Number($('#compare-a').value),b=Number($('#compare-b').value);
  const ar=rankGraph(authorGraph(base.filter(p=>p.year===a),mode,weighting),rankMode).ranking,br=rankGraph(authorGraph(base.filter(p=>p.year===b),mode,weighting),rankMode).ranking;
  const mapA=new Map(ar.map((n,i)=>[n.id,{...n,rank:i+1}])),mapB=new Map(br.map((n,i)=>[n.id,{...n,rank:i+1}])),ids=[...new Set([...ar.slice(0,10).map(n=>n.id),...br.slice(0,10).map(n=>n.id)])];
  const target=$('#ranking-comparison');if(!ids.length)return empty(target,'所选年度暂无网络记录');
  const table=text('table',''),head=document.createElement('thead');head.append(append(document.createElement('tr'),...['作者 / 机构',`${a} 名次`,`${b} 名次`,'名次变化'].map(x=>text('th',x))));table.append(head);const body=document.createElement('tbody');
  for(const id of ids){const x=mapA.get(id),y=mapB.get(id),delta=x&&y?x.rank-y.rank:null;body.append(append(document.createElement('tr'),text('td',(x||y).label),text('td',x?.rank??'—'),text('td',y?.rank??'—'),text('td',delta===null?'—':delta>0?`↑ ${delta}`:delta<0?`↓ ${-delta}`:'0')));}table.append(body);target.replaceChildren(table);
}
function renderPapers(){
  const target=$('#paper-list');$('#result-count').textContent=number(selected.length);const sort=$('#sort').value,list=[...selected].sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):(sort==='old'?a.year-b.year:b.year-a.year)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.min(page,pages);target.replaceChildren();
  if(!list.length)empty(target,'没有符合条件的论文','可清除部分筛选，或换一个关键词。');
  for(const p of list.slice((page-1)*pageSize,page*pageSize)){
    const row=text('article','','paper-row'),body=text('div',''),title=text('button',p.title,'paper-title');title.onclick=()=>paperDetails(p);
    append(body,title,text('div',(p.authors||[]).map(a=>a.name).join(' / ')||'作者待核','paper-authors'));
    const tags=text('div','','paper-tags');for(const label of valuesFor(p,'topics'))tags.append(text('span',label));for(const label of valuesFor(p,'methods'))tags.append(text('span',label,'method'));tags.append(text('span',show(valuesFor(p,'study_stage')[0]),'stage'));body.append(tags);body.append(text('div',`${p.id} · ${p.evidence_level?show(p.evidence_level):'证据状态未核'} · ${p.review_status?show(p.review_status):'复核状态未核'}`,'paper-meta'));
    const arrow=text('button','↗','paper-arrow');arrow.setAttribute('aria-label',`查看${p.title}的证据`);arrow.onclick=()=>paperDetails(p);append(row,text('div',p.year,'paper-year'),body,arrow);target.append(row);
  }
  $('#prev').disabled=page<=1;$('#next').disabled=page>=pages;$('#page-status').textContent=`第 ${page} / ${pages} 页 · 每页 ${pageSize} 篇`;
}
function renderCoverage(){
  const target=$('#coverage');const table=text('table',''),head=document.createElement('thead');head.append(append(document.createElement('tr'),...['年度','应收论文','已收条目','含全文','条目覆盖率','状态'].map(x=>text('th',x))));table.append(head);const body=document.createElement('tbody');
  for(const year of years){const c=(dataset.coverage||[]).find(x=>Number(x.year)===year)||{},count=c.collected_papers??papers.filter(p=>p.year===year).length,total=c.expected_papers,full=c.fulltext_papers,status=c.status||'待核';body.append(append(document.createElement('tr'),text('td',year),text('td',total??'未核'),text('td',count),text('td',full??'未核'),text('td',typeof total==='number'&&total>0?pct(count/total):'分母未核'),text('td',status)));}table.append(body);target.replaceChildren(table);
}
function renderExternal(){
  const target=$('#external-list');target.replaceChildren();
  if(!dataset.external?.length)return empty(target,'期刊对照尚未录入');
  for(const record of dataset.external){const item=text('div','','external-row');item.append(text('h4',record.title||record.topic||record.id||'研究对照'));if(record.venue||record.year)item.append(text('div',[record.venue,record.year].filter(Boolean).join(' · '),'source-line'));
    for(const key of ['comparison','finding','method','implication','summary'])if(record[key])item.append(text('p',record[key]));
    if(record.related_paper_ids?.length)item.append(text('div',`会议论文：${record.related_paper_ids.join(' / ')}`,'source-line'));
    if(record.url){const a=sourceLink(record.id,null,record.url);item.append(a);}target.append(item);
  }
}
function renderIdeas(){
  const target=$('#idea-list');target.replaceChildren();
  if(!dataset.ideas?.length)return empty(target,'研究机会尚未录入');
  for(const [i,idea] of dataset.ideas.entries()){
    const card=text('button','','idea-card');append(card,text('span',`RESEARCH IDEA ${String(i+1).padStart(2,'0')}`,'eyebrow'),text('h3',idea.title||idea.question||idea.id),text('p',idea.summary||idea.motivation||''),text('span','查看研究设计 ↗','idea-arrow'));
    card.onclick=()=>{const nodes=[text('h2',idea.title||idea.question||idea.id)];const fields=[['research_question','研究问题'],['question','研究问题'],['motivation','问题来源'],['gap','文献缺口'],['mechanism','理论机制'],['hypotheses','研究假设'],['data','数据与测量'],['design','研究设计'],['identification','识别策略'],['falsification','可证伪检验'],['feasibility','可行性'],['limitations','边界条件'],['nearest_neighbor','最近邻文献']];for(const [key,label] of fields)if(idea[key]){nodes.push(text('h3',label));const v=idea[key];nodes.push(text('p',Array.isArray(v)?v.join('\n'):typeof v==='object'?JSON.stringify(v,null,2):v));}if(idea.paper_ids?.length)nodes.push(text('h3','关联会议论文'),text('p',idea.paper_ids.join(' / ')));openDialog('RESEARCH OPPORTUNITY',nodes);};target.append(card);
  }
}
function render(){syncControls();selected=filterPapers(papers,state);renderActive();renderMetrics();renderTrend();renderStages();renderTopics();renderHeatmap();renderJoint();renderComparison();renderNetwork();renderPapers();document.querySelectorAll('#filters input').forEach(i=>{const dimension=i.getAttribute('aria-label').split('：')[0],key=Object.keys(labels).find(k=>labels[k]===dimension);i.checked=(state[key]||[]).includes(key==='years'?Number(i.value):i.value);});$('#query').value=state.q||'';}
function download(content, filename){const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function initialize(){
  $('#workspace').hidden=true;$('#loading').hidden=false;$('#loading').classList.remove('error');$('#loading').textContent='正在载入研究索引…';
  try{
    const response=await fetch('data/papers.json',{cache:'no-store'});if(!response.ok)throw new Error(`索引读取失败（${response.status}）`);dataset=await response.json();const validation=validateDataset(dataset);if(!validation.valid)throw new Error('索引校验失败：'+validation.errors.slice(0,3).join('；'));
    papers=dataset.papers;years=[...(dataset.years||[2022,2023,2024,2025,2026])].map(Number).sort();state=queryToState(location.search,papers,years);window.__CSWIM={dataset,validation,filterPapers,authorGraph,rankGraph};
    $('#version').textContent=dataset.version||'研究索引';$('#footer-note').textContent=`${years[0]}—${years.at(-1)} · ${number(papers.length)} 条论文记录`;
    for(const id of ['compare-a','compare-b']){const select=$('#'+id);select.replaceChildren(...years.map(y=>{const option=text('option',y);option.value=y;return option;}));}$('#compare-a').value=years[0];$('#compare-b').value=years.at(-1);
    renderFilters();renderCoverage();renderExternal();renderIdeas();render();$('#loading').hidden=true;$('#workspace').hidden=false;
    if(!papers.length){$('#loading').hidden=false;$('#loading').textContent='研究索引待导入。筛选、图表与论文列表将在核验数据接入后显示。';}
  }catch(error){$('#loading').classList.add('error');$('#loading').textContent=`${error.message}。请通过本地网页服务打开本目录，并检查 data/papers.json。`;const retry=text('button','重新载入','outline');retry.style.marginLeft='12px';retry.onclick=initialize;$('#loading').append(retry);}
}
let searchTimer;
$('#query').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>setState({q:$('#query').value}),180);});
$('#reset').onclick=()=>{state=queryToState('',papers,years);$('#query').value='';page=1;jointPage=1;syncURL();render();};
$('#share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#share-status').textContent='筛选链接已复制。';}catch{$('#share-status').textContent='可直接复制浏览器地址栏中的筛选链接。';}};
$('#export').onclick=()=>download(toCSV(selected),`CSWIM_filtered_${selected.length}.csv`);
$('#export-joint').onclick=()=>{const header=['topic','method','theory','paper_count','selected_papers','share','paper_ids','filter_query'],rows=jointCounts(selected).map(r=>[...r.values,r.count,selected.length,r.count/selected.length,r.paper_ids.join(' | '),stateToQuery(state)]);download('\ufeff'+[header,...rows].map(r=>r.map(csvQuote).join(',')).join('\r\n'),`CSWIM_joint_combinations_${rows.length}.csv`);};
$('#export-ranking').onclick=()=>{if(currentRanking)download(rankingCSV(currentRanking,{metric:$('#network-rank').value,weighting:$('#network-weight').value,filter_query:stateToQuery(state),edges:currentRanking.edges,version:dataset.version}),`CSWIM_${$('#network-weight').value}_${$('#network-rank').value}_ranking.csv`);};
document.querySelectorAll('[name=trend-mode]').forEach(i=>i.onchange=()=>setState({mode:i.value}));
for(const [id,key] of Object.entries({'heat-dimension':'heat','compare-a':'compare_a','compare-b':'compare_b','network-mode':'network_mode','network-weight':'network_weight','network-rank':'network_rank','network-limit':'network_limit','sort':'sort'}))$('#'+id).onchange=()=>setState({[key]:['compare_a','compare_b'].includes(key)?Number($('#'+id).value):$('#'+id).value});
$('#prev').onclick=()=>{page--;renderPapers();};$('#next').onclick=()=>{page++;renderPapers();};$('#joint-prev').onclick=()=>{jointPage--;renderJoint();};$('#joint-next').onclick=()=>{jointPage++;renderJoint();};
$('#close-dialog').onclick=()=>$('#detail').close();$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=$('#detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#detail').close();}});
window.addEventListener('popstate',()=>{if(dataset){state=queryToState(location.search,papers,years);page=1;jointPage=1;render();}});
initialize();
