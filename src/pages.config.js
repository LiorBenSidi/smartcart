import Admin from './pages/Admin';
import Feedback from './pages/Feedback';
import Landing from './pages/Landing';
import Main from './pages/Main';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Profile from './pages/Profile';
import Receipt from './pages/Receipt';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import CatalogAdmin from './pages/CatalogAdmin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "Feedback": Feedback,
    "Landing": Landing,
    "Main": Main,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Profile": Profile,
    "Receipt": Receipt,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "CatalogAdmin": CatalogAdmin,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};