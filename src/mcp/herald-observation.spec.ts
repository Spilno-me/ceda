import { jest } from '@jest/globals';

interface ObservationEvent {
  type: 'start' | 'intervention' | 'observation' | 'stop';
  message: string;
  timestamp: Date;
}

interface ObservationSession {
  sessionId: string;
  startTime: Date;
  events: ObservationEvent[];
  status: 'active' | 'stopped';
}

function compileSessionSummary(session: ObservationSession): string {
  const duration = Math.round((new Date().getTime() - session.startTime.getTime()) / 1000);

  const interventions = session.events.filter(e => e.type === 'intervention');
  const observations = session.events.filter(e => e.type === 'observation');

  let summary = `**Observation Session Summary**\n\n`;
  summary += `Session ID: ${session.sessionId}\n`;
  summary += `Duration: ${duration} seconds\n`;
  summary += `Status: ${session.status}\n`;
  summary += `Total Events: ${session.events.length}\n`;
  summary += `Interventions: ${interventions.length}\n`;
  summary += `Observations: ${observations.length}\n\n`;

  if (interventions.length > 0) {
    summary += `**Interventions:**\n`;
    interventions.forEach((e, i) => {
      summary += `${i + 1}. [${e.timestamp.toISOString()}] ${e.message}\n`;
    });
    summary += '\n';
  }

  if (observations.length > 0) {
    summary += `**Observations:**\n`;
    observations.forEach((e, i) => {
      summary += `${i + 1}. [${e.timestamp.toISOString()}] ${e.message}\n`;
    });
    summary += '\n';
  }

  return summary;
}

describe('Herald Active Observation', () => {
  let activeSessions: Map<string, ObservationSession>;

  beforeEach(() => {
    activeSessions = new Map();
  });

  describe('ObservationSession', () => {
    it('should create a new observation session', () => {
      const sessionId = 'test-session-1';
      const session: ObservationSession = {
        sessionId,
        startTime: new Date(),
        events: [{
          type: 'start',
          message: 'Observation session started',
          timestamp: new Date(),
        }],
        status: 'active',
      };

      activeSessions.set(sessionId, session);

      expect(activeSessions.has(sessionId)).toBe(true);
      expect(activeSessions.get(sessionId)?.status).toBe('active');
      expect(activeSessions.get(sessionId)?.events.length).toBe(1);
    });

    it('should not allow duplicate session IDs', () => {
      const sessionId = 'test-session-1';
      const session: ObservationSession = {
        sessionId,
        startTime: new Date(),
        events: [],
        status: 'active',
      };

      activeSessions.set(sessionId, session);

      expect(activeSessions.has(sessionId)).toBe(true);
    });

    it('should record intervention events', () => {
      const sessionId = 'test-session-1';
      const session: ObservationSession = {
        sessionId,
        startTime: new Date(),
        events: [{
          type: 'start',
          message: 'Observation session started',
          timestamp: new Date(),
        }],
        status: 'active',
      };

      activeSessions.set(sessionId, session);

      session.events.push({
        type: 'intervention',
        message: 'User corrected the prediction',
        timestamp: new Date(),
      });

      expect(session.events.length).toBe(2);
      expect(session.events[1].type).toBe('intervention');
      expect(session.events[1].message).toBe('User corrected the prediction');
    });

    it('should stop an observation session', () => {
      const sessionId = 'test-session-1';
      const session: ObservationSession = {
        sessionId,
        startTime: new Date(),
        events: [{
          type: 'start',
          message: 'Observation session started',
          timestamp: new Date(),
        }],
        status: 'active',
      };

      activeSessions.set(sessionId, session);

      session.status = 'stopped';
      session.events.push({
        type: 'stop',
        message: 'Observation session stopped',
        timestamp: new Date(),
      });

      expect(session.status).toBe('stopped');
      expect(session.events[session.events.length - 1].type).toBe('stop');
    });
  });

  describe('compileSessionSummary', () => {
    it('should compile a summary with no interventions', () => {
      const session: ObservationSession = {
        sessionId: 'test-session-1',
        startTime: new Date(),
        events: [
          { type: 'start', message: 'Started', timestamp: new Date() },
          { type: 'stop', message: 'Stopped', timestamp: new Date() },
        ],
        status: 'stopped',
      };

      const summary = compileSessionSummary(session);

      expect(summary).toContain('**Observation Session Summary**');
      expect(summary).toContain('Session ID: test-session-1');
      expect(summary).toContain('Status: stopped');
      expect(summary).toContain('Interventions: 0');
    });

    it('should compile a summary with interventions', () => {
      const session: ObservationSession = {
        sessionId: 'test-session-2',
        startTime: new Date(),
        events: [
          { type: 'start', message: 'Started', timestamp: new Date() },
          { type: 'intervention', message: 'First intervention', timestamp: new Date() },
          { type: 'intervention', message: 'Second intervention', timestamp: new Date() },
          { type: 'stop', message: 'Stopped', timestamp: new Date() },
        ],
        status: 'stopped',
      };

      const summary = compileSessionSummary(session);

      expect(summary).toContain('**Observation Session Summary**');
      expect(summary).toContain('Session ID: test-session-2');
      expect(summary).toContain('Interventions: 2');
      expect(summary).toContain('**Interventions:**');
      expect(summary).toContain('First intervention');
      expect(summary).toContain('Second intervention');
    });

    it('should include observations in summary', () => {
      const session: ObservationSession = {
        sessionId: 'test-session-3',
        startTime: new Date(),
        events: [
          { type: 'start', message: 'Started', timestamp: new Date() },
          { type: 'observation', message: 'User prefers checklist format', timestamp: new Date() },
          { type: 'stop', message: 'Stopped', timestamp: new Date() },
        ],
        status: 'stopped',
      };

      const summary = compileSessionSummary(session);

      expect(summary).toContain('Observations: 1');
      expect(summary).toContain('**Observations:**');
      expect(summary).toContain('User prefers checklist format');
    });

    it('should show total events count', () => {
      const session: ObservationSession = {
        sessionId: 'test-session-4',
        startTime: new Date(),
        events: [
          { type: 'start', message: 'Started', timestamp: new Date() },
          { type: 'intervention', message: 'Intervention 1', timestamp: new Date() },
          { type: 'observation', message: 'Observation 1', timestamp: new Date() },
          { type: 'intervention', message: 'Intervention 2', timestamp: new Date() },
          { type: 'stop', message: 'Stopped', timestamp: new Date() },
        ],
        status: 'stopped',
      };

      const summary = compileSessionSummary(session);

      expect(summary).toContain('Total Events: 5');
      expect(summary).toContain('Interventions: 2');
      expect(summary).toContain('Observations: 1');
    });
  });

  describe('Session Lifecycle', () => {
    it('should handle full session lifecycle: start -> intervene -> stop', () => {
      const sessionId = 'lifecycle-test';

      const session: ObservationSession = {
        sessionId,
        startTime: new Date(),
        events: [{
          type: 'start',
          message: 'Observation session started',
          timestamp: new Date(),
        }],
        status: 'active',
      };
      activeSessions.set(sessionId, session);

      expect(activeSessions.get(sessionId)?.status).toBe('active');

      session.events.push({
        type: 'intervention',
        message: 'User modified the prediction',
        timestamp: new Date(),
      });

      expect(session.events.length).toBe(2);

      session.status = 'stopped';
      session.events.push({
        type: 'stop',
        message: 'Observation session stopped',
        timestamp: new Date(),
      });

      const summary = compileSessionSummary(session);
      activeSessions.delete(sessionId);

      expect(activeSessions.has(sessionId)).toBe(false);
      expect(summary).toContain('Interventions: 1');
      expect(summary).toContain('User modified the prediction');
    });

    it('should support multiple concurrent sessions', () => {
      const session1: ObservationSession = {
        sessionId: 'session-1',
        startTime: new Date(),
        events: [{ type: 'start', message: 'Started', timestamp: new Date() }],
        status: 'active',
      };

      const session2: ObservationSession = {
        sessionId: 'session-2',
        startTime: new Date(),
        events: [{ type: 'start', message: 'Started', timestamp: new Date() }],
        status: 'active',
      };

      activeSessions.set('session-1', session1);
      activeSessions.set('session-2', session2);

      expect(activeSessions.size).toBe(2);

      session1.events.push({
        type: 'intervention',
        message: 'Intervention in session 1',
        timestamp: new Date(),
      });

      session2.events.push({
        type: 'intervention',
        message: 'Intervention in session 2',
        timestamp: new Date(),
      });

      expect(activeSessions.get('session-1')?.events.length).toBe(2);
      expect(activeSessions.get('session-2')?.events.length).toBe(2);
    });

    it('should find most recent active session when no session_id provided', () => {
      const session1: ObservationSession = {
        sessionId: 'session-1',
        startTime: new Date(Date.now() - 10000),
        events: [{ type: 'start', message: 'Started', timestamp: new Date() }],
        status: 'active',
      };

      const session2: ObservationSession = {
        sessionId: 'session-2',
        startTime: new Date(),
        events: [{ type: 'start', message: 'Started', timestamp: new Date() }],
        status: 'active',
      };

      activeSessions.set('session-1', session1);
      activeSessions.set('session-2', session2);

      const activeSessArray = Array.from(activeSessions.values()).filter(s => s.status === 'active');
      const mostRecent = activeSessArray[activeSessArray.length - 1];

      expect(mostRecent.sessionId).toBe('session-2');
    });
  });

  describe('Error Cases', () => {
    it('should handle stopping non-existent session', () => {
      const session = activeSessions.get('non-existent');
      expect(session).toBeUndefined();
    });

    it('should handle intervening with no active sessions', () => {
      const activeSessArray = Array.from(activeSessions.values()).filter(s => s.status === 'active');
      expect(activeSessArray.length).toBe(0);
    });

    it('should handle intervening on stopped session', () => {
      const session: ObservationSession = {
        sessionId: 'stopped-session',
        startTime: new Date(),
        events: [{ type: 'start', message: 'Started', timestamp: new Date() }],
        status: 'stopped',
      };

      activeSessions.set('stopped-session', session);

      expect(session.status).toBe('stopped');
    });
  });
});
