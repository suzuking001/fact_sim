# Flow v2 implementation worklog
User approved full replacement in conversation. No additional approval required.
## Decisions
- English app UI; one Flow editor; Fit All + kind selector + Add; tabs Flow/Contents/Advanced; dock button remains.
- Exactly inPort/outPort/process/recovery/entityRouter/syncroJudgment/Palletizing/DePalletizing.
- Per-equipment single cycle; parent/children are one batch; no next cycle until recovery and output complete.
- Router multiple inputs FIFO, explicit type priority, anyType fallback only, backpressure.
- Named sync groups, all members including empty must arrive, atomic release.
- Auto-pause before edits; time edits retime active operations preserving start; progress + animation share runtime clock.
- Device->device/Source->device icon uses receiver Process; device->Sink uses sender Recovery.
- Only new properties.flow format; reject old files before mutating graph. Migrate bundled 8 JSON+JS samples; line1 merge->Palletizing.
- Rename domain DOWN/downTime/etc to RECOVERY/recoveryTime throughout UI, runtime, workers, MCP, tests; not downstream/directional down.
- Right click Flip IO / Add inPort / Add outPort / Delete / Duplicate. Additional ports only router. No Palletizing context action.
## Baseline
Saved baseline Engine Test log and line1 structure in this directory. Existing working tree contains earlier user-requested changes; do not discard wholesale.
## Implementation stages
1. Pure Flow config/model and common runtime + BasicNode integration
2. Single editor and SyncroGroup + Contents/Advanced
3. Samples and engine/worker integration, animation
4. Remove legacy code, rename/English sweep
5. Full behavioral/UI tests and Engine Test quick, report actual results
