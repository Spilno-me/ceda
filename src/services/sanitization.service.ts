/**
 * CEDA-65: Sanitization Service
 *
 * Pre-storage sanitization for compliance-by-design infrastructure.
 * Classifies data, detects PII/PHI/secrets, and sanitizes before storage.
 */

import { Injectable } from '@nestjs/common';

/**
 * Data classification levels
 * PUBLIC: Safe to share publicly
 * INTERNAL: Internal use only
 * CONFIDENTIAL: Sensitive business data
 * RESTRICTED: Must be blocked entirely (private keys, credentials)
 */
export enum DataClassification {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED = 'RESTRICTED',
}

/**
 * Types of sensitive data that can be detected
 */
export enum SensitiveDataType {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  SSN = 'SSN',
  API_KEY = 'API_KEY',
  AWS_KEY = 'AWS_KEY',
  PASSWORD = 'PASSWORD',
  PRIVATE_KEY = 'PRIVATE_KEY',
  JWT_TOKEN = 'JWT_TOKEN',
  CREDIT_CARD = 'CREDIT_CARD',
  IP_ADDRESS = 'IP_ADDRESS',
  FILE_PATH = 'FILE_PATH',
  PHI_MEDICAL = 'PHI_MEDICAL',
  PHI_DIAGNOSIS = 'PHI_DIAGNOSIS',
}

/**
 * Result of sanitization operation
 */
export interface SanitizationResult {
  sanitizedText: string;
  detectedTypes: SensitiveDataType[];
  dataClass: DataClassification;
  blocked: boolean;
  blockReason?: string;
  redactions: RedactionInfo[];
}

/**
 * Information about a specific redaction
 */
export interface RedactionInfo {
  type: SensitiveDataType;
  originalLength: number;
  position: number;
  replacement: string;
}

/**
 * Pattern definition for sensitive data detection
 */
interface DetectionPattern {
  type: SensitiveDataType;
  pattern: RegExp;
  classification: DataClassification;
  replacement: string;
  block?: boolean;
}

@Injectable()
export class SanitizationService {
  private readonly patterns: DetectionPattern[] = [
    // RESTRICTED - Block entirely
    {
      type: SensitiveDataType.PRIVATE_KEY,
      pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
      classification: DataClassification.RESTRICTED,
      replacement: '[PRIVATE_KEY_BLOCKED]',
      block: true,
    },
    {
      type: SensitiveDataType.AWS_KEY,
      pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
      classification: DataClassification.RESTRICTED,
      replacement: '[AWS_KEY_REDACTED]',
      block: true,
    },
    {
      type: SensitiveDataType.AWS_KEY,
      pattern: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
      classification: DataClassification.RESTRICTED,
      replacement: 'aws_secret_access_key=[AWS_SECRET_REDACTED]',
      block: true,
    },

    // CONFIDENTIAL - Redact but allow
    {
      type: SensitiveDataType.SSN,
      pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[SSN_REDACTED]',
    },
    {
      type: SensitiveDataType.CREDIT_CARD,
      pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[CREDIT_CARD_REDACTED]',
    },
    {
      type: SensitiveDataType.API_KEY,
      pattern: /(?:api[_-]?key|apikey|api[_-]?token)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[API_KEY_REDACTED]',
    },
    {
      type: SensitiveDataType.API_KEY,
      pattern: /(?:sk|pk)[-_](?:live|test)[-_][A-Za-z0-9]{24,}/g,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[API_KEY_REDACTED]',
    },
    {
      type: SensitiveDataType.JWT_TOKEN,
      pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[JWT_TOKEN_REDACTED]',
    },
    {
      type: SensitiveDataType.PASSWORD,
      pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{4,}['"]?/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[PASSWORD_REDACTED]',
    },
    {
      type: SensitiveDataType.PASSWORD,
      pattern: /(?:secret|token|auth)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{8,}['"]?/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[SECRET_REDACTED]',
    },

    // PHI - Protected Health Information
    {
      type: SensitiveDataType.PHI_MEDICAL,
      pattern: /\b(?:patient\s+id|medical\s+record\s+number|mrn|health\s+record)\s*[:#]?\s*[A-Z0-9\-]{4,}/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[PHI_RECORD_REDACTED]',
    },
    {
      type: SensitiveDataType.PHI_DIAGNOSIS,
      pattern: /\b(?:diagnosed?\s+with|diagnosis|icd[-\s]?10|icd[-\s]?9)\s*[:#]?\s*[A-Z0-9\.\-]+/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[PHI_DIAGNOSIS_REDACTED]',
    },
    {
      type: SensitiveDataType.PHI_MEDICAL,
      pattern: /\b(?:prescription|rx|medication)\s*[:#]?\s*[A-Za-z0-9\s\-]{4,}/gi,
      classification: DataClassification.CONFIDENTIAL,
      replacement: '[PHI_MEDICATION_REDACTED]',
    },

    // INTERNAL - Redact for privacy
    {
      type: SensitiveDataType.EMAIL,
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      classification: DataClassification.INTERNAL,
      replacement: '[EMAIL_REDACTED]',
    },
    {
      type: SensitiveDataType.PHONE,
      pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
      classification: DataClassification.INTERNAL,
      replacement: '[PHONE_REDACTED]',
    },
    {
      type: SensitiveDataType.IP_ADDRESS,
      pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      classification: DataClassification.INTERNAL,
      replacement: '[IP_REDACTED]',
    },
    {
      type: SensitiveDataType.FILE_PATH,
      pattern: /(?:\/Users\/|\/home\/|C:\\Users\\)[A-Za-z0-9_\-\.]+/g,
      classification: DataClassification.INTERNAL,
      replacement: '/Users/[REDACTED]',
    },
    {
      type: SensitiveDataType.FILE_PATH,
      pattern: /(?:\/var\/|\/etc\/|\/opt\/)[A-Za-z0-9_\-\.\/]+/g,
      classification: DataClassification.INTERNAL,
      replacement: '/[PATH_REDACTED]',
    },
  ];

  /**
   * Sanitize text by detecting and redacting sensitive data
   * @param text - The text to sanitize
   * @returns SanitizationResult with sanitized text and metadata
   */
  sanitize(text: string): SanitizationResult {
    const detectedTypes: Set<SensitiveDataType> = new Set();
    const redactions: RedactionInfo[] = [];
    let sanitizedText = text;
    let highestClassification = DataClassification.PUBLIC;
    let blocked = false;
    let blockReason: string | undefined;

    // Process each pattern
    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.pattern);
      
      for (const match of matches) {
        detectedTypes.add(pattern.type);
        
        // Track redaction info
        redactions.push({
          type: pattern.type,
          originalLength: match[0].length,
          position: match.index || 0,
          replacement: pattern.replacement,
        });

        // Update classification to highest level found
        if (this.getClassificationLevel(pattern.classification) > this.getClassificationLevel(highestClassification)) {
          highestClassification = pattern.classification;
        }

        // Check if this pattern should block the entire content
        if (pattern.block) {
          blocked = true;
          blockReason = `Detected ${pattern.type}: Content contains restricted data that cannot be stored`;
        }
      }

      // Apply redaction (reset pattern for global regex)
      pattern.pattern.lastIndex = 0;
      sanitizedText = sanitizedText.replace(pattern.pattern, pattern.replacement);
    }

    return {
      sanitizedText: blocked ? '' : sanitizedText,
      detectedTypes: Array.from(detectedTypes),
      dataClass: highestClassification,
      blocked,
      blockReason,
      redactions,
    };
  }

  /**
   * Check if text contains any sensitive data without modifying it
   * @param text - The text to check
   * @returns Detection result without redaction
   */
  detect(text: string): { hasSensitiveData: boolean; types: SensitiveDataType[]; classification: DataClassification; wouldBlock: boolean } {
    const detectedTypes: Set<SensitiveDataType> = new Set();
    let highestClassification = DataClassification.PUBLIC;
    let wouldBlock = false;

    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      if (pattern.pattern.test(text)) {
        detectedTypes.add(pattern.type);
        
        if (this.getClassificationLevel(pattern.classification) > this.getClassificationLevel(highestClassification)) {
          highestClassification = pattern.classification;
        }

        if (pattern.block) {
          wouldBlock = true;
        }
      }
      pattern.pattern.lastIndex = 0;
    }

    return {
      hasSensitiveData: detectedTypes.size > 0,
      types: Array.from(detectedTypes),
      classification: highestClassification,
      wouldBlock,
    };
  }

  /**
   * Classify text without sanitizing
   * @param text - The text to classify
   * @returns DataClassification level
   */
  classify(text: string): DataClassification {
    const detection = this.detect(text);
    return detection.classification;
  }

  /**
   * Get numeric level for classification comparison
   */
  private getClassificationLevel(classification: DataClassification): number {
    switch (classification) {
      case DataClassification.PUBLIC:
        return 0;
      case DataClassification.INTERNAL:
        return 1;
      case DataClassification.CONFIDENTIAL:
        return 2;
      case DataClassification.RESTRICTED:
        return 3;
      default:
        return 0;
    }
  }

  /**
   * Validate that text is safe to store (not RESTRICTED)
   * @param text - The text to validate
   * @returns true if safe to store, false if blocked
   */
  isStorageSafe(text: string): boolean {
    const detection = this.detect(text);
    return !detection.wouldBlock;
  }

  /**
   * Get a summary of what would be detected/redacted (for dry-run mode)
   * @param text - The text to analyze
   * @returns Summary of detections without modifying text
   */
  dryRun(text: string): {
    wouldSanitize: boolean;
    detectedTypes: SensitiveDataType[];
    classification: DataClassification;
    wouldBlock: boolean;
    blockReason?: string;
    redactionCount: number;
  } {
    const result = this.sanitize(text);
    return {
      wouldSanitize: result.redactions.length > 0,
      detectedTypes: result.detectedTypes,
      classification: result.dataClass,
      wouldBlock: result.blocked,
      blockReason: result.blockReason,
      redactionCount: result.redactions.length,
    };
  }
}
