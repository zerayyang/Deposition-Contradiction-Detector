const finishedConfidence = new Set(['EXPERIMENTAL','CALIBRATED','UNCALIBRATED']);

export function reviewStages(analysis, findings = [], phase = 'analysis') {
  const documents = [1,2].map(number => {
    const coverage = analysis?.coverage?.find((item,index) => (item.document ?? index+1) === number);
    const units = coverage?.pages ?? coverage?.sections;
    const total = units?.length ?? 0;
    const done = units?.filter(unit => (unit.analysisStatus ?? unit.status) === 'complete').length ?? 0;
    const complete = analysis?.status === 'complete';
    // During scoring, distinguish finished processing from fully validated coverage.
    // A partial comparison has finished work, but its rejected findings remain gaps.
    const sections=coverage?.sections??[];
    const knownWork=sections.length>0&&sections.every(section=>Number.isInteger(section.comparisonsPlanned)&&section.comparisonsPlanned>0&&Number.isInteger(section.comparisonsCompleted)&&Number.isInteger(section.comparisonsPartial));
    const plannedWork=knownWork?sections.reduce((sum,section)=>sum+section.comparisonsPlanned,0):0;
    const processedWork=knownWork?sections.reduce((sum,section)=>sum+Math.min(section.comparisonsPlanned,section.comparisonsCompleted+section.comparisonsPartial),0):0;
    const processingPercent=phase==='scoring'&&knownWork?Math.floor(100*processedWork/plannedWork):null;
    const percent = complete ? 100 : processingPercent??(total ? Math.floor(100*done/total) : null);
    return {name:`Transcript ${number}`,percent,
      detail:complete?'Compared':phase === 'scoring'?(processingPercent===100?'Processing finished · partial results':'Partial coverage retained'):total?`${done} of ${total} ${coverage.pages?'pages':'sections'} compared`:'Reading and comparing',
      spinning:phase === 'analysis' && !complete};
  });
  const eligible = findings.filter(f => !f.labelDisagreement && ['DIRECT','INFERENTIAL','FALSE_POSITIVE'].includes(f.type));
  const checks = eligible.reduce((sum,f) => sum + (finishedConfidence.has(f.hybridConfidence?.status) ? 7 : Math.max(0,Math.min(7,f.hybridConfidence?.completedSteps ?? 0))),0);
  const total = eligible.length*7;
  const scoring = phase === 'scoring';
  return [...documents,{name:'Scoring',percent:scoring&&total?Math.floor(100*checks/total):null,
    detail:scoring?(total?`${checks} of ${total} checks finished`:'Preparing confidence checks'):'Waiting for analysis',spinning:scoring}];
}
