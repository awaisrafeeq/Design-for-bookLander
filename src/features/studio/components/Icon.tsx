// Paths from the supplied BookLender Studio design.
const paths: Record<string,string> = {home:'M3 11l9-8 9 8M5 10v10h14V10',board:'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M15 4v16',
 bulb:'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',check:'M20 6L9 17l-5-5',
 eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',cal:'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
 chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',news:'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
 users:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
 spark:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',play:'M8 5l11 7-11 7z',stack:'M8 8h12v12H8zM4 4h12v2M4 4v12h2',image:'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
 x:'M6 6l12 12M18 6L6 18',edit:'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',retry:'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5',alert:'M12 3l10 18H2zM12 10v5M12 18v.01',
 lock:'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',plug:'M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4',book:'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h8',
 help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.01',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
 dollar:'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',archive:'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
 plus:'M12 5v14M5 12h14',arrow:'M5 12h14M13 6l6 6-6 6',chevR:'M9 6l6 6-6 6',chevL:'M15 6l-6 6 6 6',chevD:'M6 9l6 6 6-6',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
 send:'M22 2L11 13M22 2l-7 20-4-9-9-4z',sliders:'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',more:'M5 12h.01M12 12h.01M19 12h.01',
 flag:'M5 21V4h11l-1.5 4L16 12H5',trend:'M3 17l6-6 4 4 8-8M15 7h6v6',brush:'M9.5 14.5c-2.5 0-4 1.5-4 5.5 3.5 0 5.5-1.5 5.5-4zM10 14l10-10-2-2L8 12z',zap:'M13 2L4 14h7l-1 8 9-12h-7z',
 tv:'M3 6h18v12H3zM8 21h8M9 2l3 4 3-4',menu:'M4 7h16M4 12h16M4 17h16',
 pie:'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
 search:'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35'};
export function Icon({name,className=''}:{name:string;className?:string}) { return <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.help}/></svg>; }
