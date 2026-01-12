import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const OTEL_COLLECTOR_URL = process.env.OTEL_COLLECTOR_URL || 'http://otel-collector.bravo-monitoring-ns:4318'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'community-service',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${OTEL_COLLECTOR_URL}/v1/traces`,
  }),
  instrumentations: [getNodeAutoInstrumentations({
    // HTTP and Express instrumentation are included by default
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
})

sdk.start()

console.log('OpenTelemetry tracing initialized for community-service')
console.log(`OTEL Collector URL: ${OTEL_COLLECTOR_URL}`)

export default sdk
