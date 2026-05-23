import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { initializeTheme } from "./utils/theme";

import Landing from "./pages/Landing";

import { createBrowserRouter, RouterProvider } from "react-router";

const PostsPage = lazy(() => import("./pages/PostsPage").then((m) => ({ default: m.PostsPage })));
const SharedItinerary = lazy(() => import("./pages/SharedItinerary"));
const PublicCollection = lazy(() => import("./pages/PublicCollection"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const FollowersList = lazy(() => import("./pages/FollowersList").then((m) => ({ default: m.FollowersList })));
const FollowingList = lazy(() => import("./pages/FollowersList").then((m) => ({ default: m.FollowingList })));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));

// Initialize dark theme support
initializeTheme();

const router = createBrowserRouter([
    {
        path: "/",
        element: <Landing />,
    },
    {
        path: "/home",
        lazy: () =>
            import("./pages/Home").then((m) => ({ Component: m.default })),
    },
    {
        path: '/explore',
        element: <Suspense fallback={null}><PostsPage /></Suspense>,
    },
    {
        path: '/shared/:id',
        element: <Suspense fallback={null}><SharedItinerary /></Suspense>,
    },
    {
        path: '/collection/:folderID',
        element: <Suspense fallback={null}><PublicCollection /></Suspense>,
    },
    {
        path: '/profile/:userID',
        element: <Suspense fallback={null}><UserProfile /></Suspense>,
    },
    {
        path: '/users/:userID/followers',
        element: <Suspense fallback={null}><FollowersList /></Suspense>,
    },
    {
        path: '/users/:userID/following',
        element: <Suspense fallback={null}><FollowingList /></Suspense>,
    },
    {
        path: '/activity',
        element: <Suspense fallback={null}><ActivityPage /></Suspense>,
    },
]);

const root = document.getElementById("root");

if (!root) {
    throw new Error("Root container missing in index.html");
}

ReactDOM.createRoot(root).render(<RouterProvider router={router} />);
