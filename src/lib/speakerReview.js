// A user explicitly confirms this batch. Unknown names never become witnesses
// automatically; reserved Q/A syntax is already handled by the source parser.
export function initialSpeakerChoices(documents){return documents.map(d=>({witness:d.hasAnswers?'__QA__':'',questioner:d.hasQuestions?'__QA__':'__NONE__'}));}
export function confirmedSpeakerRoles(documents,choices){
 return documents.map((d,i)=>{
  const choice=choices[i];
  if(!choice?.witness||choice.witness==='__NONE__'||choice.witness==='__QA__'&&!d.hasAnswers)throw new Error('Choose who gives testimony in transcript '+(i+1)+'.');
  for(const key of ['witness','questioner'])if(!['__QA__','__NONE__'].includes(choice[key])&&!d.labels.includes(choice[key]))throw new Error('Choose a listed speaker.');
  if(choice.questioner==='__QA__'&&!d.hasQuestions)throw new Error('No Q-labeled questions were found in transcript '+(i+1)+'.');
  if(choice.witness===choice.questioner&&choice.witness!=='__QA__')throw new Error('The same named turn cannot be both witness and questioner.');
  return Object.fromEntries(d.labels.map(name=>[name,name===choice.witness?'WITNESS':name===choice.questioner?'QUESTIONER':'OTHER']));
 });
}
