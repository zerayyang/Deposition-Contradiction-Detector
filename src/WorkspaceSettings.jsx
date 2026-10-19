import {useEffect, useRef, useState} from 'react';
import {readVisualPreference, saveVisualPreference} from './lib/visualPreference.js';
import './settings.css';

export default function WorkspaceSettings() {
  const dialog = useRef(null);
  const [reducedEffects, setReducedEffects] = useState(() => readVisualPreference());
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-effects', reducedEffects);
    return () => document.documentElement.classList.remove('reduced-effects');
  }, [reducedEffects]);
  function changeEffects(event) {
    const enabled = event.target.checked;
    setReducedEffects(enabled);
    setSaveFailed(!saveVisualPreference(enabled));
  }
  return <>
    <button className="workspace-settings-button" onClick={() => dialog.current?.showModal()}>Settings</button>
    <dialog className="workspace-settings" ref={dialog} aria-labelledby="settings-title">
      <header><h2 id="settings-title">Settings</h2><button className="settings-close" aria-label="Close settings" onClick={() => dialog.current?.close()}>✕</button></header>
      <section className="settings-row"><div><h3>Confidence, explained</h3><p>Try the interactive example to see how your score adds up.</p></div><a className="settings-demo-link" href="/hybrid-confidence-demo.html" target="_blank" rel="noopener noreferrer">Explore demo <span aria-hidden="true">↗</span><span className="visually-hidden"> (opens in a new tab)</span></a></section>
      <section className="settings-row"><div><h3>Future workflow (concept)</h3><p>See how background import could work: download transcripts, accept the helper’s offer, keep working, and come back when results are ready.</p></div><a className="settings-demo-link" href="/future-workflow.html" target="_blank" rel="noopener noreferrer">View concept <span aria-hidden="true">↗</span><span className="visually-hidden"> (opens in a new tab)</span></a></section>
      <section className="settings-row"><label className="settings-toggle"><span><strong>Reduce visual effects</strong><span className="settings-description">Less animation and blur for a lighter interface.</span></span><input type="checkbox" role="switch" checked={reducedEffects} onChange={changeEffects}/></label><p>Changes display only. Analysis and scoring stay the same.</p>{saveFailed && <p role="status">Applied for now. Your browser couldn’t save this preference.</p>}</section>
      <p className="settings-footnote">Display preferences are saved on this browser.</p>
    </dialog>
  </>;
}
