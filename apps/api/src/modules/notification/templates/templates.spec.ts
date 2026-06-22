import { renderTemplate } from './templates';

describe('renderTemplate', () => {
  it('renders a known template with payload', () => {
    expect(renderTemplate('welcome', { name: 'Asha' })).toEqual({
      subject: 'Welcome to the Pharmacy MCQ Platform',
      body: expect.stringContaining('Hi Asha'),
    });
  });

  it('renders revision_due with a numeric count', () => {
    expect(renderTemplate('revision_due', { count: 5 }).body).toContain('5 item(s)');
  });

  it('falls back to generic for unknown templates', () => {
    expect(renderTemplate('does_not_exist', { subject: 'Hello', body: 'World' })).toEqual({
      subject: 'Hello',
      body: 'World',
    });
  });
});
