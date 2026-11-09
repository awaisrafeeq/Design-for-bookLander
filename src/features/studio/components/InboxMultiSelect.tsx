'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Option = {value:string;label:string};
type Props = {label:string; allLabel:string; options:Option[]; value:string[]; onChange:(values:string[])=>void};
export function InboxMultiSelect({label,allLabel,options,value,onChange}:Props) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[open]);
  const selected=options.filter(option=>value.includes(option.value));
  const summary=value.length===0?allLabel:value.length===1?(selected[0]?.label||`${label}: 1 selected`):`${label}: ${value.length} selected`;
  return <div ref={ref} className="inbox-multiselect"><button type="button" className="inbox-filter-trigger" aria-label={`${label}: ${summary}`} aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(current=>!current)}><span>{summary}</span><Icon name="chevD"/></button>{open&&<div className="inbox-filter-menu" role="group" aria-label={label}><div className="inbox-filter-menu-head"><b>{label}</b><button type="button" onClick={()=>onChange([])}>Clear</button></div><div className="inbox-filter-options">{options.length?options.map(option=><label key={option.value}><input type="checkbox" checked={value.includes(option.value)} onChange={()=>onChange(value.includes(option.value)?value.filter(item=>item!==option.value):[...value,option.value])}/><span>{option.label}</span></label>):<p>No accounts available for these platforms.</p>}</div></div>}</div>;
}
