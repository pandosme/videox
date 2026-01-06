import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Camera as CameraIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 240;

const menuItems = [
  { text: 'Cameras', icon: <CameraIcon />, path: '/cameras' },
  { text: 'Storage', icon: <StorageIcon />, path: '/storage' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
        },
      }}
    >
      <List sx={{ pt: 8 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}

export default Sidebar;
