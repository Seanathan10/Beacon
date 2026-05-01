export type SessionUser = {
    id: number;
};

declare global {
    namespace Express {
        export interface Request {
            user: SessionUser;
        }
    }
}
