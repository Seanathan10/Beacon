import { lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { initializeTheme } from "./utils/theme";

import Landing from "./pages/Landing";
import { RouteBoundary } from "./components/RouteBoundary";

import { createBrowserRouter, RouterProvider } from "react-router";

const Home = lazy(() => import("./pages/Home"));
const PostsPage = lazy(() => import("./pages/PostsPage").then((m) => ({ default: m.PostsPage })));
const SharedItinerary = lazy(() => import("./pages/SharedItinerary"));
const PublicCollection = lazy(() => import("./pages/PublicCollection"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const FollowersList = lazy(() => import("./pages/FollowersList").then((m) => ({ default: m.FollowersList })));
const FollowingList = lazy(() => import("./pages/FollowersList").then((m) => ({ default: m.FollowingList })));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const MyTrips = lazy(() => import("./pages/MyTrips"));
const MyTripView = lazy(() => import("./pages/MyTripView"));
const SustainabilityPage = lazy(() => import("./pages/SustainabilityPage"));

// Initialize dark theme support
initializeTheme();

const router = createBrowserRouter([
    {
        path: "/",
        element: <Landing />,
    },
    {
        path: "/home",
        element: <RouteBoundary><Home /></RouteBoundary>,
    },
    {
        path: '/explore',
        element: <RouteBoundary><PostsPage /></RouteBoundary>,
    },
    {
        path: '/shared/:id',
        element: <RouteBoundary><SharedItinerary /></RouteBoundary>,
    },
    {
        path: '/collection/:folderID',
        element: <RouteBoundary><PublicCollection /></RouteBoundary>,
    },
    {
        path: '/profile/:userID',
        element: <RouteBoundary><UserProfile /></RouteBoundary>,
    },
    {
        path: '/users/:userID/followers',
        element: <RouteBoundary><FollowersList /></RouteBoundary>,
    },
    {
        path: '/users/:userID/following',
        element: <RouteBoundary><FollowingList /></RouteBoundary>,
    },
    {
        path: '/activity',
        element: <RouteBoundary><ActivityPage /></RouteBoundary>,
    },
    {
        path: '/notifications',
        element: <RouteBoundary><NotificationsPage /></RouteBoundary>,
    },
    {
        path: '/my-trips',
        element: <RouteBoundary><MyTrips /></RouteBoundary>,
    },
    {
        path: '/my-trips/:id',
        element: <RouteBoundary><MyTripView /></RouteBoundary>,
    },
    {
        path: '/sustainability',
        element: <RouteBoundary><SustainabilityPage /></RouteBoundary>,
    },
]);

const root = document.getElementById("root");

if (!root) {
    throw new Error("Root container missing in index.html");
}

ReactDOM.createRoot(root).render(<RouterProvider router={router} />);
