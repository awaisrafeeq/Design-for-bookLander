import ReviewPage from '@/features/studio/pages/ReviewPage';
import { Suspense } from 'react';
export default function Page() { return <Suspense fallback={<div className="loading">Loading review…</div>}><ReviewPage/></Suspense>; }
