import { useState } from 'react';
import { Icon } from './Icon';
type Point = { label: string; value: number };
export function BarChart({ data, width = 520, height = 190, max, step, label, format = (value: number) => String(value), axisFormat, all = false, cap }: { data: Point[]; width?: number; height?: number; max: number; step: number; label: string; format?: (value: number) => string; axisFormat?: (value: number) => string; all?: boolean; cap?: number }) {
  const L=34,R=12,T=20,B=30, innerH=height-T-B,barWidth=(width-L-R)/data.length;
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>{Array.from({length:Math.floor(max/step)+1},(_,i)=>i*step).map(value=>{const y=T+innerH-(value/max)*innerH;return <g key={value}><line className="gl" x1={L} x2={width-R} y1={y} y2={y}/><text className="ax" x={L-8} y={y+4} textAnchor="end">{axisFormat?axisFormat(value):format(value)}</text></g>})}{data.map((point,index)=>{const h=point.value/max*innerH,x=L+index*barWidth+barWidth*.18,w=barWidth*.64,y=T+innerH-h;return <g key={index}><rect className={`bar ${index===data.length-1?'now':''}`} x={x} y={y} width={w} height={h} rx="2"/><text className="ax" x={x+w/2} y={height-10} textAnchor="middle">{point.label}</text>{(all||index===data.length-1)&&<text className="val" x={x+w/2} y={y-6} textAnchor="middle">{format(point.value)}</text>}</g>})}{cap!=null&&<><line className="cap" x1={L} x2={width-R} y1={T+innerH-cap/max*innerH} y2={T+innerH-cap/max*innerH}/><text className="capl" x={width-R} y={T+innerH-cap/max*innerH-6} textAnchor="end">Limit ${cap}</text></>}</svg>;
}
function LineChart({ data, label }: { data: Point[]; label: string }) {
  const W=520,H=190,L=34,R=18,T=26,B=30,PAD=18,max=Math.ceil(Math.max(...data.map(d=>d.value))/2)*2+2,step=2,innerH=H-T-B,x0=L+PAD,x1=W-R-PAD;
  const points=data.map((point,index)=>({x:data.length>1?x0+index*(x1-x0)/(data.length-1):(x0+x1)/2,y:T+innerH-point.value/max*innerH,...point}));
  const line=points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join(' ');
  const area=`M${points[0].x} ${T+innerH} ${points.map(point=>`L${point.x} ${point.y}`).join(' ')} L${points.at(-1)!.x} ${T+innerH} Z`;
  return <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>{Array.from({length:Math.floor(max/step)+1},(_,index)=>index*step).map(value=>{const y=T+innerH-value/max*innerH;return <g key={value}><line className="gl" x1={L} x2={W-R} y1={y} y2={y}/><text className="ax" x={L-8} y={y+4} textAnchor="end">{value}%</text></g>})}<path d={area} fill="var(--brandsoft)" opacity=".7"/><path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{points.map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="4.5" fill="var(--surf)" stroke="var(--brand)" strokeWidth="2.5"/><text className="val" x={point.x} y={point.y-10} textAnchor="middle">{point.value}%</text><text className="ax" x={point.x} y={H-8} textAnchor="middle">{point.label}</text></g>)}</svg>;
}
function PieChart({ data }: { data: Point[] }) {
  const colors=['var(--brand)','var(--ai)','var(--ok)','var(--need)','var(--autoc)'];const sum=data.reduce((n,p)=>n+p.value,0);let angle=0;
  const stops=data.map((point,index)=>{const from=angle/sum*360;angle+=point.value;return `${colors[index%colors.length]} ${from}deg ${angle/sum*360}deg`}).join(',');
  const top=data.reduce((best,point)=>point.value>best.value?point:best,data[0]);
  return <div className="pie"><div className="piewheel"><div className="piering" role="img" aria-label={`Share by ${data.map(item=>item.label).join(', ')}`} style={{background:`conic-gradient(${stops})`}}/><div className="piehole"><b>{top.value}%</b><span>{top.label}</span></div></div><div className="pielist">{data.map((item,index)=><span className="pielegend" key={item.label}><i style={{background:colors[index%colors.length]}}/>{item.label}<b>{item.value}%</b></span>)}</div></div>;
}
export function MetricChart({ data, label, title }: { data: Point[]; label: string; title: string }) {
  const [view,setView]=useState<'bar'|'pie'|'line'>('bar');const max=Math.ceil(Math.max(...data.map(d=>d.value))/2)*2+2;
  return <><div className="subrow"><h3>{title}</h3><div className="viewtog">{(['bar','pie','line'] as const).map(item=><button key={item} className={view===item?'on':''} aria-label={`${item} view`} onClick={()=>setView(item)}><Icon name={item==='bar'?'chart':item==='pie'?'pie':'trend'}/></button>)}</div></div>{view==='pie'?<PieChart data={data}/>:view==='line'?<LineChart data={data} label={label}/>:<BarChart data={data} max={max} step={2} format={value=>`${value}%`} label={label} all/>}</>;
}
