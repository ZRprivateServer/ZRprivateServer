export const prefix = '/api';

async function routes(app) {
    app.get('/', () => {
        return {
            status: 'success'
        };
    });
}

export default routes;
