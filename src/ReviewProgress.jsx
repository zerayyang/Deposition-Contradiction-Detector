import {reviewStages} from './lib/reviewProgress.js';

export default function ReviewProgress({analysis,findings,phase}) {
  return <section className="review-stage-progress" aria-label="Review stages">
    {reviewStages(analysis,findings,phase).map(stage => <div className="review-stage" key={stage.name}>
      <div className={`review-stage-ring${stage.spinning?' is-loading':''}`} role="progressbar" aria-label={stage.name}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage.percent ?? undefined} aria-valuetext={stage.detail}>
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="stage-ring-track" cx="32" cy="32" r="27" />
          <circle className="stage-ring-fill" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${stage.percent ?? (stage.spinning?22:0)} 100`} /></svg>
        <span>{stage.percent === null ? (stage.spinning?'…':'—') : `${stage.percent}%`}</span>
      </div><div><strong>{stage.name}</strong><small>{stage.detail}</small></div>
    </div>)}
  </section>;
}
