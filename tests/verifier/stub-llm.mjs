// Unit-test transport only. Never imported by the live verifier CLI or application.
export default class AnthropicStub {
  constructor() {
    this.messages = { create: async () => {
      const queue=globalThis.__verifierStubQueue;
      if (!Array.isArray(queue)||!queue.length) throw new Error('Unit LLM transport response queue exhausted');
      const raw=queue.shift();
      return {content:[{type:'text',text:JSON.stringify(raw)}],stop_reason:'end_turn',usage:{input_tokens:0,output_tokens:0}};
    }};
  }
}
