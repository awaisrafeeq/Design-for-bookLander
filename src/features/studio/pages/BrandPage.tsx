'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '../components/StudioProvider';
import { Header, Icon } from '../components/Design';
import { formats } from '../domain';
import type { BrandStyleTemplate, Format } from '../types';

const formatOrder: Format[] = ['image', 'carousel', 'video'];
type TemplateEditor = { format: Format; id?: string; name: string; instructions: string };

export default function BrandPage() {
  const {state,command,pending}=useStudio();
  const brand=state.brand;
  const [voice,setVoice]=useState(brand.voice);
  const [rule,setRule]=useState('');
  const [styles,setStyles]=useState<Record<string,string>>({});
  const [format,setFormat]=useState<Format>('image');
  const [search,setSearch]=useState('');
  const [editor,setEditor]=useState<TemplateEditor|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<BrandStyleTemplate|null>(null);
  useEffect(()=>{
    setVoice(brand.voice);
    setStyles(Object.fromEntries(brand.styles.map(style=>[style.format,style.guidance])));
  },[brand]);
  const style=brand.styles.find(item=>item.format===format) || brand.styles[0];
  const filteredTemplates=useMemo(()=>style?.templates.filter(item=>
    `${item.name} ${item.instructions}`.toLowerCase().includes(search.trim().toLowerCase())
  )||[],[style,search]);
  const learning=brand.weeklyLearning;

  async function saveTemplate(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!editor)return;
    const action=editor.id?'template-update':'template-add';
    const ok=await command('brand',{action,format:editor.format,templateId:editor.id,name:editor.name.trim(),instructions:editor.instructions.trim()});
    if(ok)setEditor(null);
  }
  async function deleteTemplate() {
    if(!deleteTarget)return;
    if(await command('brand',{action:'template-delete',format,templateId:deleteTarget.id}))setDeleteTarget(null);
  }

  return <>
    <div className="grid2">
      <section className="card pad sec"><Header title="Voice"/><textarea disabled={!state.permissions?.['brand.edit']} rows={5} aria-label="Brand voice" value={voice} onChange={event=>setVoice(event.target.value)} onBlur={()=>{if(voice!==brand.voice)void command('brand',{key:'voice',value:voice})}}/><span className="small muted">The AI writes every caption in this voice.</span></section>
      <section className="card pad sec"><Header title="Never say"><span className="chip red r">Phrase checks + review</span></Header>{brand.never.map((text,index)=><div className="never" key={`${text}-${index}`}><Icon name="x"/><span>{text}</span><button aria-label="Remove rule" disabled={pending || !state.permissions?.['brand.edit']} onClick={()=>void command('brand',{action:'remove-rule',id:index})}><Icon name="x"/></button></div>)}<form className="addtopic" style={{maxWidth:'none'}} onSubmit={async event=>{event.preventDefault();if(await command('brand',{action:'add-rule',value:rule}))setRule('')}}><input placeholder="Add a rule" aria-label="Add a never-say rule" value={rule} onChange={event=>setRule(event.target.value)}/><button className="btn ghost" disabled={pending || !state.permissions?.['brand.edit']}><Icon name="plus"/>Add</button></form></section>
    </div>

    <section className="brand-styles sec">
      <div className="brand-styles-heading"><div><Header title="Style for each post type"/><p className="small muted">Set shared guidance, then create reusable templates for individual posts.</p></div><span className="brand-template-count">{brand.styles.reduce((count,item)=>count+item.templates.length,0)} templates</span></div>
      <div className="brand-format-tabs" role="tablist" aria-label="Post type">
        {formatOrder.map(item=>{const current=brand.styles.find(row=>row.format===item);return <button type="button" role="tab" aria-selected={format===item} className={format===item?'active':''} key={item} onClick={()=>{setFormat(item);setSearch('')}}><Icon name={formats[item].icon}/><span>{formats[item].label}</span><small>{current?.templates.length||0}</small></button>})}
      </div>
      {style&&<section className="card pad brand-format-panel" role="tabpanel">
        <div className="brand-guidance"><div><b>{style.name} guidance</b><span className="small muted">Applies to every {style.name.toLowerCase()} post unless a template adds more direction.</span></div><textarea disabled={!state.permissions?.['brand.edit']} rows={3} aria-label={`${style.name} style guidance`} value={styles[style.format]||''} onChange={event=>setStyles({...styles,[style.format]:event.target.value})} onBlur={()=>{if(styles[style.format]!==style.guidance)void command('brand',{key:`style:${style.format}`,value:styles[style.format]})}} placeholder={`Set the default style for ${style.name.toLowerCase()} posts.`}/></div>
        <div className="brand-template-toolbar"><div><h3>Templates</h3><span className="small muted">Select one in the post editor when creating content.</span></div><div className="brand-template-actions"><label className="brand-template-search"><Icon name="search"/><input aria-label="Search templates" placeholder="Search templates" value={search} onChange={event=>setSearch(event.target.value)}/></label><button className="btn" disabled={!state.permissions?.['brand.edit']||pending} onClick={()=>setEditor({format:style.format,name:'',instructions:''})}><Icon name="plus"/>New template</button></div></div>
        <div className="brand-template-list">{filteredTemplates.length?filteredTemplates.map(template=><article className="brand-template-row" key={template.id}><span className="brand-template-icon"><Icon name={formats[style.format].icon}/></span><div className="brand-template-info"><b>{template.name}</b><p>{template.instructions}</p></div><div className="brand-template-row-actions"><button className="btn ghost sm" disabled={pending||!state.permissions?.['brand.edit']} onClick={()=>setEditor({format:style.format,id:template.id,name:template.name,instructions:template.instructions})}>Edit</button><button className="btn ghost sm" disabled={pending||!state.permissions?.['brand.edit']} onClick={()=>setDeleteTarget(template)}>Delete</button></div></article>):<div className="brand-template-empty"><span className="brand-template-icon"><Icon name={search?'search':'spark'}/></span><div><b>{search?'No matching templates':'No templates yet'}</b><p>{search?'Try another search.':'Create a template to reuse a specific style for this post type.'}</p></div></div>}</div>
      </section>}
    </section>

    {learning&&<section className="card pad sec"><Header title="Weekly learning suggestion"><span className="chip ai r"><Icon name="spark"/>Needs your review</span></Header><p className="small muted">Top post for {learning.weekStart}–{learning.weekEnd}: <b>{learning.title}</b> · {learning.platform} · {learning.format}</p><p className="small">Engagement grew by {learning.metrics.engagementGain} with {learning.metrics.reachAtEnd} reach ({learning.metrics.weeklyGainRate}% of reach; {learning.metrics.samples} daily samples). The AI suggestion is a style observation, not proof of why the post performed well.</p><blockquote className="card pad">{learning.guidance}<p className="small muted">{learning.rationale}</p></blockquote><div className="tools"><button className="btn" disabled={pending||!state.permissions?.['brand.edit']} onClick={()=>void command('brand',{action:'review-learning',id:learning.id,decision:'approve'})}>Approve and apply</button><button className="btn ghost" disabled={pending||!state.permissions?.['brand.edit']} onClick={()=>void command('brand',{action:'review-learning',id:learning.id,decision:'dismiss'})}>Dismiss</button></div></section>}

    {editor&&<div className="brand-template-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setEditor(null)}}><section className="card brand-template-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-template-title"><header><div><span className="chip"><Icon name={formats[editor.format].icon}/>{formats[editor.format].label}</span><h2 id="brand-template-title">{editor.id?'Edit template':'New template'}</h2><p className="small muted">Templates add focused instructions to the shared post style.</p></div><button type="button" className="iconbtn" aria-label="Close" onClick={()=>setEditor(null)}><Icon name="x"/></button></header><form onSubmit={saveTemplate}><label>Template name<input autoFocus required maxLength={80} value={editor.name} onChange={event=>setEditor({...editor,name:event.target.value})} placeholder="e.g. Reader question"/></label><label>Instructions<textarea required maxLength={1600} rows={6} value={editor.instructions} onChange={event=>setEditor({...editor,instructions:event.target.value})} placeholder="Describe the tone, structure, or visual direction to reuse."/></label><div className="brand-template-dialog-footer"><span className="small muted">{editor.instructions.length}/1,600 characters</span><div><button type="button" className="btn ghost" onClick={()=>setEditor(null)}>Cancel</button><button className="btn" disabled={pending||!editor.name.trim()||!editor.instructions.trim()}>{pending?'Saving…':editor.id?'Save changes':'Create template'}</button></div></div></form></section></div>}
    {deleteTarget&&<div className="brand-template-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setDeleteTarget(null)}}><section className="card brand-template-dialog brand-template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title"><span className="brand-template-icon"><Icon name="alert"/></span><h2 id="delete-template-title">Delete this template?</h2><p>“{deleteTarget.name}” will be removed from {formats[format].label} templates. Posts already created with it will keep their content.</p><div className="brand-template-dialog-footer"><span/><div><button className="btn ghost" onClick={()=>setDeleteTarget(null)}>Cancel</button><button className="btn danger" disabled={pending} onClick={()=>void deleteTemplate()}>{pending?'Deleting…':'Delete template'}</button></div></div></section></div>}
  </>;
}
