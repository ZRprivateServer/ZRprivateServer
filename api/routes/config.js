export const prefix = '/api/config';

async function routes(app) {
    app.get('/', async () => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.query(
            'SELECT `key`, value FROM globals WHERE `key` IN (\'show_announcement\', \'announcement_title\', \'announcement_type\', \'announcement_message\', \'maintenance\')'
        );
        db.release();
        const globals = rows.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {});
        const response = {
            status: 'success',
            config: {
                version: 'cab92086d1439ecadb09bfc6b5ad83bd0b14f689',
                maintenance: globals.maintenance === 'true',
                update_required: false,
                disable_udp: false,
                environment: 'prod',
                endpoint: 'zombsroyale',
                regions: ['linode-singapore', 'linode-frankfurt', 'vultr-miami', 'vultr-la']
            },
            extras: {
                season_preview: {
                    season: 42,
                    current_day: 0,
                    timer_ends: '1970-01-01 00:00:00'
                }
            }
        };
        if (globals.show_announcement === 'true') {
            response.extras.announcement = {
                title: globals.announcement_title,
                message: globals.announcement_message,
                type: globals.announcement_type
            };
        }
        return response;
    });
}

export default routes;
