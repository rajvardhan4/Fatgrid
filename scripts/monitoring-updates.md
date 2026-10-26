# Hosted backlink updater

This owner-private Site supports scheduled processing without changing its audience or publishing code again.

1. Read the linked Site using Sites `get_site`. Verify it is still owner-private. If it is no longer owner-private, stop and report that the shared updater must be reconfigured.
2. Obtain the current `siwc_bypass_bearer_token` from that response. Use it only on the returned Site origin as `OAI-Sites-Authorization: Bearer <token>`. Keep it in memory and never log it.
3. POST an empty JSON object to `/api/internal/tick` on that origin. The worker starts only due checks for users who enabled monitoring, resumes already requested checks, applies unit limits, and persists results. It accepts no caller-selected user, URL or target.
4. Read the JSON response. `ok: true` confirms the operation; `pending` and `completed` are database readback counts. If pending work remains, repeat up to 20 times in this run, stopping on failure. Checkpointed processing prevents a retry from starting a duplicate run or charging twice.
5. Do not create example checks, import data, alter plans, change sharing, or republish. Report a meaningful processing/access failure; stay quiet when no action is needed. Users see completed check details and changes in the app.

The endpoint is enabled by `PRIVATE_SCHEDULER=1` only on this owner-private deployment. The platform authenticates the service call before dispatch. Remove that setting or use independent `CRON_SECRET` authorization before changing the audience.
