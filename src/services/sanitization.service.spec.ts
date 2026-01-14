/**
 * CEDA-65: Sanitization Service Tests
 *
 * Tests for data classification, PII/PHI/secret detection, and sanitization.
 */

import {
  SanitizationService,
  DataClassification,
  SensitiveDataType,
} from './sanitization.service';

describe('SanitizationService', () => {
  let service: SanitizationService;

  beforeEach(() => {
    service = new SanitizationService();
  });

  describe('Data Classification', () => {
    it('should classify clean text as PUBLIC', () => {
      const result = service.classify('This is a normal message about coding');
      expect(result).toBe(DataClassification.PUBLIC);
    });

    it('should classify text with email as INTERNAL', () => {
      const result = service.classify('Contact me at user@example.com');
      expect(result).toBe(DataClassification.INTERNAL);
    });

    it('should classify text with phone number as INTERNAL', () => {
      const result = service.classify('Call me at 555-123-4567');
      expect(result).toBe(DataClassification.INTERNAL);
    });

    it('should classify text with SSN as CONFIDENTIAL', () => {
      const result = service.classify('SSN: 123-45-6789');
      expect(result).toBe(DataClassification.CONFIDENTIAL);
    });

    it('should classify text with credit card as CONFIDENTIAL', () => {
      const result = service.classify('Card: 4111111111111111');
      expect(result).toBe(DataClassification.CONFIDENTIAL);
    });

    it('should classify text with API key as CONFIDENTIAL', () => {
      const result = service.classify('api_key=sk_live_abc123def456ghi789');
      expect(result).toBe(DataClassification.CONFIDENTIAL);
    });

    it('should classify text with private key as RESTRICTED', () => {
      const result = service.classify('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----');
      expect(result).toBe(DataClassification.RESTRICTED);
    });

    it('should classify text with AWS secret key as RESTRICTED', () => {
      const result = service.classify('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result).toBe(DataClassification.RESTRICTED);
    });
  });

  describe('PII Detection', () => {
    it('should detect email addresses', () => {
      const result = service.detect('Contact john.doe@company.com for help');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.EMAIL);
    });

    it('should detect phone numbers', () => {
      const result = service.detect('Phone: (555) 123-4567');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PHONE);
    });

    it('should detect SSN', () => {
      const result = service.detect('Social Security: 123-45-6789');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.SSN);
    });

    it('should detect IP addresses', () => {
      const result = service.detect('Server IP: 192.168.1.100');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.IP_ADDRESS);
    });

    it('should detect file paths', () => {
      const result = service.detect('File at /Users/john/Documents/secret.txt');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.FILE_PATH);
    });
  });

  describe('PHI Detection', () => {
    it('should detect medical record numbers', () => {
      const result = service.detect('MRN: 12345678');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PHI_MEDICAL);
    });

    it('should detect diagnosis terms', () => {
      const result = service.detect('Patient diagnosed with diabetes');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PHI_DIAGNOSIS);
    });

    it('should detect prescription information', () => {
      const result = service.detect('Prescription for metformin 500mg');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PHI_MEDICAL);
    });
  });

  describe('Secret Detection', () => {
    it('should detect API keys', () => {
      const result = service.detect('api_key=sk_test_1234567890abcdef');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.API_KEY);
    });

    it('should detect JWT tokens', () => {
      const result = service.detect('token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.JWT_TOKEN);
    });

    it('should detect password patterns', () => {
      const result = service.detect('password: MySecretPass123!');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PASSWORD);
    });

    it('should detect private keys', () => {
      const result = service.detect('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.PRIVATE_KEY);
    });

    it('should detect AWS access keys', () => {
      const result = service.detect('AKIAIOSFODNN7EXAMPLE');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.AWS_KEY);
    });
  });

  describe('Sanitization', () => {
    it('should redact email addresses', () => {
      const result = service.sanitize('Contact user@example.com for help');
      expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.EMAIL);
    });

    it('should redact phone numbers', () => {
      const result = service.sanitize('Call 555-123-4567');
      expect(result.sanitizedText).toContain('[PHONE_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.PHONE);
    });

    it('should redact SSN', () => {
      const result = service.sanitize('SSN: 123-45-6789');
      expect(result.sanitizedText).toContain('[SSN_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.SSN);
    });

    it('should redact file paths', () => {
      const result = service.sanitize('File at /Users/john/secret.txt');
      expect(result.sanitizedText).toContain('[REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.FILE_PATH);
    });

    it('should redact API keys', () => {
      const result = service.sanitize('api_key=sk_live_abcdef123456');
      expect(result.sanitizedText).toContain('[API_KEY_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.API_KEY);
    });

    it('should redact passwords', () => {
      const result = service.sanitize('password: secret123');
      expect(result.sanitizedText).toContain('[PASSWORD_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.PASSWORD);
    });

    it('should handle multiple sensitive data types', () => {
      const result = service.sanitize('Email: user@test.com, Phone: 555-123-4567');
      expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
      expect(result.sanitizedText).toContain('[PHONE_REDACTED]');
      expect(result.detectedTypes).toContain(SensitiveDataType.EMAIL);
      expect(result.detectedTypes).toContain(SensitiveDataType.PHONE);
    });

    it('should return correct data classification', () => {
      const result = service.sanitize('SSN: 123-45-6789');
      expect(result.dataClass).toBe(DataClassification.CONFIDENTIAL);
    });

    it('should include redaction info', () => {
      const result = service.sanitize('Email: user@test.com');
      expect(result.redactions.length).toBeGreaterThan(0);
      expect(result.redactions[0].type).toBe(SensitiveDataType.EMAIL);
      expect(result.redactions[0].originalLength).toBeGreaterThan(0);
    });
  });

  describe('Storage Safety', () => {
    it('should allow storage of clean text', () => {
      const result = service.isStorageSafe('This is a normal message');
      expect(result).toBe(true);
    });

    it('should allow storage of INTERNAL classified text', () => {
      const result = service.isStorageSafe('Contact user@example.com');
      expect(result).toBe(true);
    });

    it('should allow storage of CONFIDENTIAL classified text', () => {
      const result = service.isStorageSafe('SSN: 123-45-6789');
      expect(result).toBe(true);
    });

    it('should detect private keys as restricted', () => {
      const result = service.classify('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----');
      expect(result).toBe(DataClassification.RESTRICTED);
    });

    it('should detect AWS secret keys', () => {
      const result = service.detect('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result.hasSensitiveData).toBe(true);
      expect(result.types).toContain(SensitiveDataType.AWS_KEY);
    });
  });

  describe('Dry Run Mode', () => {
    it('should preview sanitization without modifying', () => {
      const result = service.dryRun('Email: user@test.com, SSN: 123-45-6789');
      expect(result.wouldSanitize).toBe(true);
      expect(result.detectedTypes).toContain(SensitiveDataType.EMAIL);
      expect(result.detectedTypes).toContain(SensitiveDataType.SSN);
      expect(result.redactionCount).toBeGreaterThan(0);
    });

    it('should detect restricted content', () => {
      const result = service.dryRun('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----');
      expect(result.detectedTypes).toContain(SensitiveDataType.PRIVATE_KEY);
    });

    it('should return classification', () => {
      const result = service.dryRun('SSN: 123-45-6789');
      expect(result.classification).toBe(DataClassification.CONFIDENTIAL);
    });

    it('should handle clean text', () => {
      const result = service.dryRun('This is a normal message');
      expect(result.wouldSanitize).toBe(false);
      expect(result.detectedTypes).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = service.sanitize('');
      expect(result.sanitizedText).toBe('');
      expect(result.dataClass).toBe(DataClassification.PUBLIC);
    });

    it('should handle text with only whitespace', () => {
      const result = service.sanitize('   \n\t  ');
      expect(result.dataClass).toBe(DataClassification.PUBLIC);
    });

    it('should handle very long text', () => {
      const longText = 'Normal text '.repeat(1000) + 'user@test.com';
      const result = service.sanitize(longText);
      expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
    });

    it('should handle special characters', () => {
      const result = service.sanitize('Email: user+tag@example.com');
      expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
    });

    it('should handle international phone formats', () => {
      const result = service.sanitize('Phone: +1-555-123-4567');
      expect(result.detectedTypes).toContain(SensitiveDataType.PHONE);
    });
  });
});
