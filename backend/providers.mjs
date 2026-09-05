export class DisabledCoordinatorProvider {
  async process() { return { enabled: false, additional_context: null, cloud_agent_used: false }; }
}
/** Future providers implement process(context); no cloud provider installed. */
export const coordinator = new DisabledCoordinatorProvider();
