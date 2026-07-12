import maintenanceScreen from '@/assets/maintenance-screen.png.asset.json';

const Maintenance = () => (
  <div className="fixed inset-0 z-[9999] bg-black">
    <img
      src={maintenanceScreen.url}
      alt="System maintenance"
      className="h-full w-full object-cover object-center"
    />
  </div>
);

export default Maintenance;
