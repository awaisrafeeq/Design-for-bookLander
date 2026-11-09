'use client';
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';

type Row = Record<string, any>;
type ReplyPage = {items:Row[];cursor:string};
type Props = {
  items:Row[]; canReply:boolean; isAd:boolean; platform:string; busy:string;
  replyTo:Row|null; draft:string; sending:boolean; replyPages:Record<string,ReplyPage>; loadingReply:string;
  onReply:(item:Row|null)=>void; onDraft:(value:string)=>void; onSubmit:()=>void;
  onModerate:(action:string,item:Row,remove:boolean)=>void;
  onLoadReplies:(item:Row,cursor?:string)=>void;
};
const text = (...values:unknown[]) => values.find(value=>typeof value==='string'&&value.trim()) as string|undefined || '';
const id = (item:Row) => text(item.id,item.commentId,item.platformCommentId);
const author = (item:Row) => text(item.author?.name,item.author?.username,item.from?.name,item.from?.username,item.senderName,item.username,'Reader');
const timestamp = (value:unknown) => {if(typeof value!=='string')return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
const likes = (item:Row):number|null => {for(const key of ['likeCount','likesCount','like_count','likes_count','likes']){const value=item[key];if((typeof value==='number'||(typeof value==='string'&&value.trim()))&&Number.isFinite(Number(value)))return Math.max(0,Number(value));}return null;};
const countReplies = (item:Row):number|null => {for(const key of ['replyCount','repliesCount','reply_count','replies_count']){const value=item[key];if((typeof value==='number'||(typeof value==='string'&&value.trim()))&&Number.isFinite(Number(value)))return Math.max(0,Number(value));}return null;};
const nestedReplies = (item:Row):Row[] => Array.isArray(item.replies)?item.replies:Array.isArray(item.replies?.data)?item.replies.data:[];
const parentId = (item:Row) => text(item.parentCommentId,item.parentId,item.parent_id,item.parent?.id);
const imageUrl = (...values:unknown[]) => {for(const value of values){if(typeof value!=='string')continue;try{const url=new URL(value);if(url.protocol==='https:')return url.href;}catch{}}return '';};

export function CommentThread(props:Props) {
  const {items,canReply,isAd,platform,busy,replyTo,draft,sending,replyPages,loadingReply,onReply,onDraft,onSubmit,onModerate,onLoadReplies}=props;
  const rootIds=new Set(items.map(id).filter(Boolean));
  const roots=items.filter(item=>!parentId(item)||!rootIds.has(parentId(item)));
  function render(item:Row,depth:number,ancestors:Set<string>):ReactNode {
    const itemId=id(item);if(itemId&&ancestors.has(itemId))return null;
    const nextAncestors=new Set(ancestors);if(itemId)nextAncestors.add(itemId);
    const page=replyPages[itemId];
    const children=[...(page?.items||[]),...nestedReplies(item),...items.filter(child=>itemId&&parentId(child)===itemId)].filter((child,index,all)=>{const key=id(child);return !key||all.findIndex(candidate=>id(candidate)===key)===index;});
    const replyCount=countReplies(item),hasMore=Boolean(page?.cursor||(!page&&(item.repliesHasMore===true||(replyCount!==null&&replyCount>children.length))));
    const name=author(item),picture=imageUrl(item.author?.profilePicture,item.author?.profilePictureUrl,item.author?.avatarUrl,item.from?.picture,item.from?.profilePicture,item.profilePicture,item.profilePictureUrl,item.avatarUrl);
    const isInstagram=platform.toLowerCase()==='instagram';
    const likeIcon=<span className={`comment-like-icon facebook ${item.isLiked?'is-liked':''}`}><Icon name="thumb"/></span>;
    const own=item.isFromMe===true||item.fromMe===true||item.isOwn===true||item.isOwnAccount===true||item.author?.isOwnAccount===true||item.from?.isOwner===true;
    const hidden=item.isHidden===true||item.hidden===true;
    const count=likes(item),isReplying=Boolean(itemId&&replyTo&&id(replyTo)===itemId);
    const action=(kind:string,remove:boolean,label:string,busyLabel:string)=><button type="button" disabled={Boolean(busy)} onClick={()=>onModerate(kind,item,remove)}>{busy===`${itemId}:${kind}`?<><i className="inbox-spinner"/>{busyLabel}</>:label}</button>;
    return <div className={`comment-branch ${depth?'is-reply':''}`} key={itemId||`${name}-${depth}`}>
      <article className={`comment-card ${own?'is-own':''} ${hidden?'is-hidden':''}`}>
        <span className="comment-avatar">{picture?<img src={picture} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>:name.slice(0,1).toUpperCase()}</span>
        <div className="comment-content"><div className="comment-author"><b>{name}</b>{own&&<span className="comment-badge">You</span>}{hidden&&<span className="comment-badge hidden">Hidden</span>}</div>
          <p>{text(item.message,item.text,item.content,item.body,'Comment content unavailable.')}</p>
          <div className="comment-meta"><time>{timestamp(text(item.createdAt,item.timestamp,item.createdTime))}</time>
            {!isInstagram&&(item.canLike&&canReply&&!isAd?<button type="button" className={`comment-like-action ${item.isLiked?'is-liked':''}`} disabled={Boolean(busy)} aria-label={`${item.isLiked?'Unlike':'Like'} comment${count!==null?`, ${count} likes`:''}`} aria-pressed={Boolean(item.isLiked)} onClick={()=>onModerate('like_comment',item,Boolean(item.isLiked))}>{busy===`${itemId}:like_comment`?<i className="inbox-spinner"/>:likeIcon}<span>{count!==null?count:item.isLiked?'Liked':'Like'}</span></button>:count!==null?<span className="comment-like-count" aria-label={`${count} likes`}>{likeIcon}<span>{count}</span></span>:null)}
            {canReply&&!isAd&&item.canReply!==false&&<button type="button" onClick={()=>onReply(isReplying?null:item)}>Reply</button>}
            {canReply&&!isAd&&item.canHide&&action('hide_comment',hidden,hidden?'Unhide':'Hide',hidden?'Unhiding…':'Hiding…')}
            {canReply&&!isAd&&platform.toLowerCase()==='tiktok'&&action('pin_comment',Boolean(item.isPinned),item.isPinned?'Unpin':'Pin',item.isPinned?'Unpinning…':'Pinning…')}
          </div>
          {isReplying&&<div className="comment-inline-reply"><label htmlFor={`reply-${itemId}`}>Replying to {name}</label><textarea id={`reply-${itemId}`} autoFocus value={draft} onChange={event=>onDraft(event.target.value)} placeholder="Write a public reply…" maxLength={10000}/><div><button type="button" className="btn ghost sm" onClick={()=>onReply(null)}>Cancel</button><button type="button" className="btn sm" disabled={!draft.trim()||sending} onClick={onSubmit}><Icon name="send"/>{sending?'Sending…':'Send reply'}</button></div></div>}
        </div>
      </article>
      {children.length>0&&<div className="comment-replies">{children.map(child=>render(child,depth+1,nextAncestors))}</div>}
      {hasMore&&itemId&&<button type="button" className="comment-load-replies" disabled={loadingReply===itemId} onClick={()=>onLoadReplies(item,page?.cursor)}>{loadingReply===itemId?'Loading replies…':page?.cursor?'Load more replies':`View replies${replyCount!==null?` (${replyCount})`:''}`}</button>}
    </div>;
  }
  return <div className="comment-thread-list">{roots.map(item=>render(item,0,new Set()))}</div>;
}
