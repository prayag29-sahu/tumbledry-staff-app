// Test environment setup
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/tumbledry_test';
process.env['DIRECT_DATABASE_URL'] = 'postgresql://test:test@localhost:5432/tumbledry_test';
process.env['JWT_SECRET'] = 'test-jwt-secret-must-be-at-least-32-characters-long!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-must-be-at-least-32-characters-!';
process.env['JWT_ACCESS_EXPIRY'] = '15m';
process.env['JWT_REFRESH_EXPIRY_DAYS'] = '30';
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
process.env['RATE_LIMIT_WINDOW_MS'] = '900000';
process.env['RATE_LIMIT_LOGIN_MAX'] = '100';
process.env['LOG_LEVEL'] = 'error'; // suppress logs in tests
process.env['MAX_UPLOAD_MB'] = '5';
