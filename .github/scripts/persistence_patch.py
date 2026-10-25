from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected source block missing in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "index.js",
    "import crypto from 'crypto';\n",
    "import crypto from 'crypto';\nimport {getPersistenceStatus, initializePersistentSnapshot, installPersistenceMiddleware} from './persistence.js';\n",
)
replace_once(
    "index.js",
    "app.use(express.json({limit: '128kb'}));\nregisterPublicPages(app);",
    "app.use(express.json({limit: '128kb'}));\ninstallPersistenceMiddleware(app);\nregisterPublicPages(app);",
)
replace_once(
    "index.js",
    "app.get('/health', (_req, res) => res.json({ok: true, service: 'aesd-server', phoneOtpConfigured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER), time: new Date().toISOString()}));",
    "app.get('/health', (_req, res) => res.json({ok: true, service: 'aesd-server', phoneOtpConfigured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER), persistence: getPersistenceStatus(), time: new Date().toISOString()}));",
)
replace_once(
    "index.js",
    "app.listen(PORT, () => console.log(`AESD server running on ${PORT}`));",
    "await initializePersistentSnapshot();\napp.listen(PORT, () => console.log(`AESD server running on ${PORT}`));",
)
print('Persistence integration patch applied')
