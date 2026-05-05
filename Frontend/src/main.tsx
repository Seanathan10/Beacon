import ReactDOM from "react-dom/client";
import "./index.css";
import { initializeTheme } from "./utils/theme";

import Landing from "./pages/Landing";
import SharedItinerary from "./pages/SharedItinerary";
import PublicCollection from "./pages/PublicCollection";
import UserProfile from "./pages/UserProfile";
import { FollowersList, FollowingList } from "./pages/FollowersList";

import { createBrowserRouter, RouterProvider } from "react-router";
import { PostsPage } from "./pages/PostsPage";

// Initialize dark theme support
initializeTheme();

const router = createBrowserRouter([
    {
        path: "/",
        element: <Landing />,
    },
    {
        path: "/home",
        // Lazy load Home page so prefetch can preload it
        lazy: () =>
            import("./pages/Home").then((m) => ({ Component: m.default })),
    },
    {
        path: '/explore',
        element: <PostsPage />,
    },
    {
        path: '/shared/:id',
        element: <SharedItinerary />,
    },
    {
        path: '/collection/:folderID',
        element: <PublicCollection />,
    },
    {
        path: '/profile/:userID',
        element: <UserProfile />,
    },
    {
        path: '/users/:userID/followers',
        element: <FollowersList />,
    },
    {
        path: '/users/:userID/following',
        element: <FollowingList />,
    },
]);

const root = document.getElementById("root");

if (!root) {
    throw new Error("Root container missing in index.html");
}

ReactDOM.createRoot(root).render(<RouterProvider router={router} />);
