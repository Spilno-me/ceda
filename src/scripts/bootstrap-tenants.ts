import { TenantEmbeddingService } from '../services/tenant-embedding.service';

const INITIAL_TENANTS = [
  {
    id: 'goprint',
    domain: 'Kiosk operations for self-service printing. Print job management, hardware monitoring, payment processing, paper and ink status, device connectivity, queue management.',
  },
  {
    id: 'disrupt',
    domain: 'Health Safety Environment (HSE) compliance. Safety procedures, risk assessment, incident reporting, regulatory compliance, hazard identification, emergency protocols.',
  },
  {
    id: 'spilno',
    domain: 'Trust network for collective governance. User invitations, company onboarding, project setup, collective initiatives, resource pooling, member coordination.',
  },
];

export async function bootstrapTenants(service: TenantEmbeddingService): Promise<void> {
  console.log('[Bootstrap] Starting tenant initialization...');

  for (const tenant of INITIAL_TENANTS) {
    const existing = await service.getContext(tenant.id);
    if (!existing) {
      console.log(`[Bootstrap] Initializing tenant: ${tenant.id}`);
      const result = await service.initialize(tenant.id, tenant.domain);
      if (result) {
        console.log(`[Bootstrap] Successfully initialized tenant: ${tenant.id}`);
      } else {
        console.warn(`[Bootstrap] Failed to initialize tenant: ${tenant.id}`);
      }
    } else {
      console.log(`[Bootstrap] Tenant already exists: ${tenant.id}`);
    }
  }

  console.log('[Bootstrap] Tenant initialization complete');
}

export { INITIAL_TENANTS };
