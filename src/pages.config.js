import Admin from './pages/Admin';
import CatalogAdmin from './pages/CatalogAdmin';
import Feedback from './pages/Feedback';
import Home from './pages/Home';
import Landing from './pages/Landing';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Profile from './pages/Profile';
import Receipt from './pages/Receipt';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import Recommendations from './pages/Recommendations';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CatalogAdmin": CatalogAdmin,
    "Feedback": Feedback,
    "Home": Home,
    "Landing": Landing,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Profile": Profile,
    "Receipt": Receipt,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "Recommendations": Recommendations,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};