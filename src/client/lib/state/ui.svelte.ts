class UIState {
  isMobile = $state(false);
  drawerOpen = $state(false);
  private resizeHandler: (() => void) | null = null;

  detect() {
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    const check = () => {
      this.isMobile = window.innerWidth <= 768;
    };
    check();
    this.resizeHandler = check;
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
