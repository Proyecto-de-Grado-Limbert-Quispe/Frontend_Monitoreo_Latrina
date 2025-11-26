import React from 'react';
import { ChildItem } from '../Sidebaritems';
import { SidebarItem } from 'flowbite-react';
import { Icon } from '@iconify/react';
import { Link, useLocation } from 'react-router';
import { useAuth } from 'src/context/AuthContext';

interface NavItemsProps {
  item: ChildItem;
}

const NavItems: React.FC<NavItemsProps> = ({ item }) => {
  const location = useLocation();
  const { clearAuth } = useAuth();
  const pathname = location.pathname;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (item.url === '/auth/login') {
      event.preventDefault();
      clearAuth();
      if (typeof window !== 'undefined') {
        try {
          window.open('', '_self', '');
        } catch (error) {
          console.warn('No se pudo abrir una ventana en blanco antes de cerrar', error);
        }
        alert('La sesión ha sido cerrada correctamente. Puedes cerrar esta pestaña.');
        if (typeof window.close === 'function') {
          window.close();
        }
      }
    }
  };

  return (
    <>
      <Link
        to={item.url}
        onClick={handleClick}
        target={item.isPro ? 'blank' : '_self'}
        className="block"
      >
        <SidebarItem
          as="div"
          className={`realtive mb-1 sidebar-link  relative  py-0 ps-6 pe-4  ${
            item.url == pathname
              ? `text-primary  ${
                  item.icon ? ` bg-primary/10   hover:bg-primary/10 ` : 'bg-transparent '
                }   active `
              : ` text-dark/90 bg-transparent  group/link before:content-[''] before:absolute before:start-0 before:top-0 before:h-full before:w-0 hover:before:w-full before:bg-primary/10 before:transition-all before:duration-400 before:rounded-e-full hover:bg-transparent  hover:text-primary  `
          } `}
        >
          <div className="flex items-center justify-between">
            <span className="flex gap-3 align-center items-center">
              {item.icon ? (
                <Icon icon={item.icon} className={`${item.color}`} height={22} />
              ) : (
                <span
                  className={`ms-2 me-3 ${
                    item.url == pathname
                      ? ' rounded-full mx-1.5 group-hover/link:bg-dark bg-dark  h-[6px] w-[6px]'
                      : 'h-[6px] w-[6px] bg-black/40 rounded-full  group-hover/link:bg-dark'
                  } `}
                ></span>
              )}
              <span className={`max-w-32 text-ellipsis overflow-x-hidden`}>{item.name}</span>
            </span>
            {item.isPro ? (
              <span className="py-1 px-2 text-[10px] bg-secondary/20 text-secondary rounded-full">
                Pro
              </span>
            ) : null}
          </div>
        </SidebarItem>
      </Link>
    </>
  );
};

export default NavItems;
