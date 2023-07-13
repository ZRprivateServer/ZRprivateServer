export const prefix = '/api/leaderboard';

async function routes(app) {
    app.get('/live', async (req) => {
        const db = await app.mysql.getConnection();
        let user = null;
        if (req.query.userKey && req.query.time === 'all') {
            const [userRow] = await db.execute(
                `SELECT
                  friend_code,
                  (SELECT COUNT(*) + 1 FROM users WHERE friend_code IS NOT NULL AND id < u.id) AS \`rank\`
                 FROM users u
                 WHERE id = (SELECT user_id FROM sessions WHERE \`key\` = ?)`,
                [req.query.userKey]
            );
            if (userRow.length > 0) {
                user = userRow[0];
            }
        }
        const [rows] = await db.query('SELECT friend_code FROM users WHERE friend_code IS NOT NULL ORDER BY id LIMIT 50');
        db.release();
        const leaderboardPlayers = rows.map((row) => {
            let name = row.friend_code.split('#')[0];
            if (name === '') name = row.friend_code;
            return {
                name,
                kills: 0,
                kills_per_round: 0,
                rounds: 0,
                time_alive: 0,
                top10: 0,
                winrate: 0,
                wins: 0
            };
        });
        const response = {
            status: 'success',
            players: leaderboardPlayers
        };
        if (user) {
            let name = user.friend_code.split('#')[0];
            if (name === '') name = user.friend_code;
            response.user = {
                name,
                kills: 0,
                kills_per_round: 0,
                rounds: 0,
                time_alive: 0,
                top10: 0,
                winrate: 0,
                wins: 0,
                rank: user.rank
            };
        }
        console.log(response);
        return response;
    });
}

export default routes;
