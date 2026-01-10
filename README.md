# CEDA - Cognitive Event-Driven Architecture

AI-native copilot layer for intelligent application interfaces.

## Philosophy

CEDA is designed around the principle that AI assistants should *understand* user intent through signal processing, pattern recognition, and predictive modeling - not just respond to commands.

## Architecture

```
User Input → Signal Processor → Pattern Library → Prediction Engine → Validation → Output
                    ↓                                      ↓
              Context Signals                        Feedback Loop
```

### Services

| Service | Purpose |
|---------|---------|
| `SignalProcessorService` | Classifies intent, extracts entities, routes decisions |
| `PatternLibraryService` | Maintains extensible domain patterns |
| `PredictionEngineService` | Generates structure predictions from signals |
| `CognitiveValidationService` | Validates predictions with auto-fix capability |
| `CognitiveOrchestratorService` | Pipeline orchestration with observability |
| `FeedbackService` | Learning loop for continuous improvement |

## Quick Start

```bash
yarn install
yarn test
yarn build
```

## Server

Run the HTTP server to test the pipeline:

```bash
yarn serve
```

Then test with curl:

```bash
# Health check
curl http://localhost:3030/health

# Run prediction
curl -X POST http://localhost:3030/api/predict \
  -H "Content-Type: application/json" \
  -d '{"input": "create assessment module"}'

# With custom config
curl -X POST http://localhost:3030/api/predict \
  -H "Content-Type: application/json" \
  -d '{"input": "add safety checklist", "config": {"enableAutoFix": true}}'
```

## Usage

```typescript
import { CognitiveOrchestratorService } from '@spilno/ceda';

const result = await orchestrator.execute('Create a safety assessment form');
if (result.success) {
  console.log(result.prediction); // Generated module structure
}
```

## License

MIT

