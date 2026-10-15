import 'dotenv/config';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import {createApp} from './app.js';
// Keep the existing entry command; tests import app.js/handlers instead.
const instructions=fs.readFileSync(new URL('./proper_prompts.md',import.meta.url),'utf8');
const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:240000});
const app=createApp({instructions,callModel:(params,options)=>anthropic.messages.create(params,options)});
app.listen(3000,()=>console.log('Server running on port 3000'));
