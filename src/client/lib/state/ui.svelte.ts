class UIState {
  isMobile = $state(false);
  drawerOpen = $state(false);

  detect() {
    const check = () => {
      this.isMobile = window.innerWidth <= 768;
    };
    check();
    window.addEventListener('resize', check);
  }

  toggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
  }

  closeDrawer() {
    this.drawerOpen = false;
  }
}

export const uiState = new UIState();
