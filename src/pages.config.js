import Landing from './pages/Landing';
import Home from './pages/Home';
import Upload from './pages/Upload';
import Receipt from './pages/Receipt';
import Recommendations from './pages/Recommendations';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Landing": Landing,
    "Home": Home,
    "Upload": Upload,
    "Receipt": Receipt,
    "Recommendations": Recommendations,
    "Profile": Profile,
    "Admin": Admin,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};