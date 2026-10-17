import test from 'node:test';import assert from 'node:assert/strict';
import {priorOverlap} from './identity.mjs';
const index={sources:[{sourceUrl:'https://www.example.org/original#page=1',caseNames:['Synthetic Party v. Example Party, 100 F.3d 1'],dockets:['1:2024-cv-00012'],metadata:[{court:'Synthetic Court'}]}]};
test('old opinions are excluded across URL, case-name and court/docket aliases',()=>{
 assert.equal(priorOverlap({sourceUrl:'https://example.org/original',source:'Other'},index),true);
 assert.equal(priorOverlap({sourceUrl:'https://example.org/alternate',source:'Synthetic Party v Example Party, alternate citation'},index),true);
 assert.equal(priorOverlap({sourceUrl:'https://example.org/new',source:'Different',provenance:{court:'Synthetic Court',docket:'1:24-cv-12'}},index),true);
 assert.equal(priorOverlap({sourceUrl:'https://example.org/new',source:'Different',provenance:{court:'Another Court',docket:'1:24-cv-12'}},index),false);
});
