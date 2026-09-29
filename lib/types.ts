export type Product = {
    id: string;
    name: string;
    category: string;
    description: string;
    price: number;
    imageUrl: string;
    badge: string | null;
    stock: number;
};

export type CartItem = {
    productId: string;
    quantity: number;
};