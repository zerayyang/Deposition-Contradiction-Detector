const messages={
 NO_GOVERNING_QUESTION:'The quotation was found in witness speech, but its supplied question link has no identified governing question. Review the source context; no score was assigned.',
 QUESTION_ANCHOR_MISMATCH:'The quotation was found in witness speech, but the supplied question does not exactly match its governing question.',
 ANSWER_ANCHOR_MISMATCH:'The quotation was found in witness speech, but the supplied full-answer anchor does not match that witness turn.',
 ANSWER_ANCHOR_EXCLUDES_QUOTE:'The supplied full-answer anchor does not contain this exact quotation.',
 INVALID_ANCHOR:'The supplied question or answer anchor is invalid.'
};
export function sourceBindingMessage(binding){
 if(!binding)return 'No occurrence-specific source check was saved.';
 if(binding.status==='BOUND')return binding.selected?.question?'One witness occurrence and its governing question were located.':'One witness occurrence was located; no governing question was identified.';
 if(binding.status==='ANCHOR_MISMATCH'){
  const reasons=[...new Set((binding.diagnostics??[]).map(d=>messages[d.code]).filter(Boolean))];
  return reasons.join(' ')||'A witness quotation was found, but its supplied question or answer anchor did not match.';
 }
 if(binding.status==='AMBIGUOUS')return 'Several witness occurrences match. Confirm the intended occurrence before scoring.';
 return 'The exact quotation was not located in recognized witness speech.';
}
export {locateQuote} from './quoteLocation.js';
